import { Env } from '../types';

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export interface AttendanceRecord {
  date: string;
  student_id: string;
  seat: string;
  status: string;
  checkin_at: string | null;
  name: string;
  class: string;
  class_no: number;
  card_id: string;
}

async function getAccessToken(creds: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      iss: creds.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );

  const toUrlSafe = (s: string) => s.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signingInput = `${toUrlSafe(header)}.${toUrlSafe(payload)}`;

  const pemBody = creds.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '');
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  const sigB64 = toUrlSafe(btoa(String.fromCharCode(...new Uint8Array(sig))));
  const jwt = `${signingInput}.${sigB64}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function sheetsCall(
  token: string,
  spreadsheetId: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
  return res.json();
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    PRESENT: '準時抵達',
    LATE: '遲到',
    OUT: '準時抵達',
    ABSENT: '曠課',
    EXCUSED: '請假',
    EXPECTED: '曠課',
  };
  return map[status] ?? status;
}

async function ensureStudentSheet(
  token: string,
  spreadsheetId: string,
  existingSheets: Map<string, number>,
  record: AttendanceRecord,
): Promise<void> {
  const tabName = `${record.name}考勤表`;
  if (existingSheets.has(tabName)) return;

  const addRes = (await sheetsCall(token, spreadsheetId, 'POST', ':batchUpdate', {
    requests: [{ addSheet: { properties: { title: tabName } } }],
  })) as { replies: [{ addSheet: { properties: { sheetId: number } } }] };

  existingSheets.set(tabName, addRes.replies[0].addSheet.properties.sheetId);

  const range = encodeURIComponent(`${tabName}!A1:J4`);
  await sheetsCall(token, spreadsheetId, 'PUT', `/values/${range}?valueInputOption=USER_ENTERED`, {
    values: [
      ['班級', '座號', '姓名', '卡號', '應到', '實到', '遲到', '請假', '曠課', '出勤比'],
      [record.class, record.class_no, record.name, record.card_id, 0, 0, 0, 0, 0, '0%'],
      [],
      ['日期', '狀態', '簽到時間'],
    ],
  });
}

async function recalcStudentStats(
  token: string,
  spreadsheetId: string,
  tabName: string,
): Promise<{ 應到: number; 實到: number; 遲到: number; 請假: number; 曠課: number; 出勤比: string }> {
  const range = encodeURIComponent(`${tabName}!A5:C`);
  const data = (await sheetsCall(token, spreadsheetId, 'GET', `/values/${range}`)) as {
    values?: string[][];
  };
  const rows = data.values ?? [];

  const 應到 = rows.length;
  const 實到 = rows.filter((r) => r[1] === '準時抵達' || r[1] === '遲到').length;
  const 遲到 = rows.filter((r) => r[1] === '遲到').length;
  const 請假 = rows.filter((r) => r[1] === '請假').length;
  const 曠課 = rows.filter((r) => r[1] === '曠課').length;
  const 出勤比 = 應到 > 0 ? `${Math.round((實到 / 應到) * 100)}%` : '0%';

  return { 應到, 實到, 遲到, 請假, 曠課, 出勤比 };
}

async function upsertSemesterStats(
  token: string,
  spreadsheetId: string,
  existingSheets: Map<string, number>,
  record: AttendanceRecord,
  stats: ReturnType<typeof recalcStudentStats> extends Promise<infer T> ? T : never,
): Promise<void> {
  const tabName = '學期統計';

  if (!existingSheets.has(tabName)) {
    const addRes = (await sheetsCall(token, spreadsheetId, 'POST', ':batchUpdate', {
      requests: [{ addSheet: { properties: { title: tabName } } }],
    })) as { replies: [{ addSheet: { properties: { sheetId: number } } }] };
    existingSheets.set(tabName, addRes.replies[0].addSheet.properties.sheetId);

    const hRange = encodeURIComponent(`${tabName}!A1:J1`);
    await sheetsCall(token, spreadsheetId, 'PUT', `/values/${hRange}?valueInputOption=USER_ENTERED`, {
      values: [['姓名', '班級', '座號', '應到', '實到', '出勤比', '遲到', '請假', '曠課', '可領保證金']],
    });
  }

  const colARange = encodeURIComponent(`${tabName}!A:A`);
  const colData = (await sheetsCall(token, spreadsheetId, 'GET', `/values/${colARange}`)) as {
    values?: string[][];
  };
  const names = (colData.values ?? []).flat();
  const rowIndex = names.indexOf(record.name);

  const pct = parseInt(stats.出勤比);
  const row = [
    record.name,
    record.class,
    record.class_no,
    stats.應到,
    stats.實到,
    stats.出勤比,
    stats.遲到,
    stats.請假,
    stats.曠課,
    pct >= 80 ? '是' : '否',
  ];

  if (rowIndex === -1) {
    const appendRange = encodeURIComponent(`${tabName}!A:J`);
    await sheetsCall(
      token,
      spreadsheetId,
      'POST',
      `/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { values: [row] },
    );
  } else {
    const n = rowIndex + 1;
    const updateRange = encodeURIComponent(`${tabName}!A${n}:J${n}`);
    await sheetsCall(
      token,
      spreadsheetId,
      'PUT',
      `/values/${updateRange}?valueInputOption=USER_ENTERED`,
      { values: [row] },
    );
  }
}

export async function syncToSheets(env: Env, records: AttendanceRecord[]): Promise<void> {
  const creds: ServiceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);
  const token = await getAccessToken(creds);
  const spreadsheetId = env.GOOGLE_SPREADSHEET_ID;

  const meta = (await sheetsCall(token, spreadsheetId, 'GET', '?fields=sheets.properties')) as {
    sheets: { properties: { title: string; sheetId: number } }[];
  };
  const existingSheets = new Map<string, number>(
    meta.sheets.map((s) => [s.properties.title, s.properties.sheetId]),
  );

  for (const record of records) {
    const tabName = `${record.name}考勤表`;

    await ensureStudentSheet(token, spreadsheetId, existingSheets, record);

    const appendRange = encodeURIComponent(`${tabName}!A:C`);
    await sheetsCall(
      token,
      spreadsheetId,
      'POST',
      `/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { values: [[record.date, statusLabel(record.status), record.checkin_at ?? '—']] },
    );

    const stats = await recalcStudentStats(token, spreadsheetId, tabName);

    const statsRange = encodeURIComponent(`${tabName}!E2:J2`);
    await sheetsCall(
      token,
      spreadsheetId,
      'PUT',
      `/values/${statsRange}?valueInputOption=USER_ENTERED`,
      { values: [[stats.應到, stats.實到, stats.遲到, stats.請假, stats.曠課, stats.出勤比]] },
    );

    await upsertSemesterStats(token, spreadsheetId, existingSheets, record, stats);
  }
}

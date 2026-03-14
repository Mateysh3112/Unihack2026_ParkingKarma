import * as admin from 'firebase-admin';

interface RawServiceAccount {
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

const TIMEOUT_MS = 30_000;

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function main() {
  const rawServiceAccount = require('../serviceAccount.json') as RawServiceAccount;
  const projectId = rawServiceAccount.project_id;
  const clientEmail = rawServiceAccount.client_email;
  const privateKey = rawServiceAccount.private_key;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('serviceAccount.json is missing one of: project_id, client_email, private_key');
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    projectId,
  });

  console.log('── Firestore Diagnostic ───────────────────────────────');
  console.log(`Project: ${projectId}`);
  console.log(`Service account: ${clientEmail}`);

  console.log('\n[1/2] Testing Google OAuth token exchange...');
  const accessToken = await withTimeout(
    admin.credential.applicationDefault().getAccessToken(),
    TIMEOUT_MS,
    `OAuth token exchange timed out after ${TIMEOUT_MS / 1000}s`,
  );
  console.log(`OAuth OK. Token expires at: ${accessToken.expires_in ?? 'unknown'}`);

  console.log('\n[2/2] Testing Firestore REST write...');
  const db = admin.firestore();
  db.settings({
    ignoreUndefinedProperties: true,
    preferRest: true,
  });

  const ref = db.doc('_meta/diagnosticProbe');
  await withTimeout(
    ref.set(
      {
        touchedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'diagnoseFirestore',
      },
      { merge: true },
    ),
    TIMEOUT_MS,
    `Firestore write timed out after ${TIMEOUT_MS / 1000}s`,
  );
  console.log('Firestore write OK.');

  const snap = await withTimeout(
    ref.get(),
    TIMEOUT_MS,
    `Firestore read timed out after ${TIMEOUT_MS / 1000}s`,
  );
  console.log(`Firestore read OK. Document exists: ${snap.exists}`);
  console.log('\n✅ Diagnostic completed.');
}

main().catch((error) => {
  console.error('\n❌ Diagnostic failed:', error);
  process.exit(1);
});

# itesys_country_coordination

GovernanceOS baseline app for monthly agendas and document coordination.

## Stack
- Next.js (App Router, TypeScript)
- Firebase Auth (email/password)
- Firestore (data)
- Firebase Storage (artefacts + agenda-exports folders)

## Getting started
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the environment template and fill in your Firebase Web App config:
   ```bash
   cp .env.example .env.local
   ```
3. Run the dev server:
   ```bash
   npm run dev
   ```

## Firebase setup checklist
- Create a Firebase project and a Web App.
- Enable **Email/Password** sign-in in Firebase Auth.
- Create a single Storage bucket (default) and use folders:
  - `artefacts/`
  - `agenda-exports/`
- Firestore will be used for the app data model (roles, periods, artefacts, agendas, actions).

## Environment variables
These are referenced in `src/lib/firebase/client.ts`.

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

## Notes
- The landing page shows Firebase Auth signed-in status and provides a basic email/password sign-in form.
- Store any service account credentials in secret managers or `.env.local` only if a future server-only Firebase Admin SDK integration is needed.

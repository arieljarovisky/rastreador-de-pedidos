/**
 * Obtiene un refresh token de Google Calendar para agendar demos.
 *
 * Uso:
 *   1. Activá Google Calendar API en Google Cloud Console
 *   2. En el cliente OAuth, agregá redirect URI: http://localhost:3333/oauth2callback
 *   3. En backend/.env poné GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET
 *   4. npm run google:token
 */
import http from 'http';
import { URL } from 'url';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const PORT = 3333;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

if (!clientId || !clientSecret) {
  console.error('Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en backend/.env');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

console.log('\n1) Abrí esta URL en el navegador (con la cuenta de Calendar de Posta):\n');
console.log(authUrl);
console.log('\n2) Autorizá el acceso. Vas a volver a localhost automáticamente.\n');
console.log('Esperando callback en', REDIRECT_URI, '...\n');

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    if (url.pathname !== '/oauth2callback') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>Error OAuth</h1><p>${error}</p>`);
      console.error('OAuth error:', error);
      server.close();
      process.exit(1);
      return;
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Falta el código de autorización</h1>');
      return;
    }

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<h1>Listo</h1><p>Refresh token generado. Volvé a la terminal y copiá las variables.</p>'
    );

    console.log('Tokens obtenidos:\n');
    if (tokens.refresh_token) {
      console.log('GOOGLE_CALENDAR_REFRESH_TOKEN=' + tokens.refresh_token);
    } else {
      console.warn(
        'No llegó refresh_token. Revocá el acceso previo en https://myaccount.google.com/permissions y repetí con prompt=consent.'
      );
    }
    console.log('\nTambién agregá en Railway / backend/.env:');
    console.log('GOOGLE_CALENDAR_ID=primary');
    console.log('DEMO_TIMEZONE=America/Argentina/Buenos_Aires\n');

    server.close();
    process.exit(0);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Error interno</h1>');
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Servidor local listo.');
});

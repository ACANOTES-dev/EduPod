export default function NotFound() {
  return (
    <html lang="en">
      <body>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 600 }}>404</h1>
            {/* eslint-disable-next-line school/no-untranslated-strings -- root 404 page has no locale context */}
            <p>Page not found</p>
          </div>
        </div>
      </body>
    </html>
  );
}

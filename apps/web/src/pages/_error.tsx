import type { NextPageContext } from 'next';

interface ErrorProps {
  statusCode: number;
}

function ErrorPage({ statusCode }: ErrorProps) {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 600 }}>
        {statusCode === 404 ? 'Page not found' : 'Something went wrong'}
      </h1>
      <p style={{ color: '#666', marginTop: '0.5rem' }}>
        {statusCode === 404
          ? 'The page you are looking for does not exist.'
          : `An error ${statusCode} occurred on the server.`}
      </p>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext): ErrorProps => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 500;
  return { statusCode };
};

export default ErrorPage;

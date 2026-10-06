export const config = {
  matcher: ['/((?!assets/|fonts/|lotties/|vendor/).*)'],
};

const UA_ALLOWED_REGIONS = new Set([
  'UA-40', 'UA-43', 'UA-65', 'UA-23', 'UA-09', 'UA-14',
  '40', '43', '65', '23', '09', '14',
]);

function isStaticPath(path) {
  if (path.startsWith('/assets/')) return true;
  if (path.startsWith('/fonts/')) return true;
  if (path.startsWith('/lotties/')) return true;
  if (path.startsWith('/vendor/')) return true;
  if (path === '/favicon.ico') return true;
  if (path === '/robots.txt') return true;
  if (path === '/sitemap.xml') return true;
  if (path === '/errors.css') return true;
  if (/\.(?:css|js|mjs|map|json|png|jpe?g|svg|webp|gif|ico|woff2?|ttf|eot|otf)$/i.test(path)) return true;
  return false;
}

export default function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (isStaticPath(path)) return;
  if (path === '/blocked' || path.startsWith('/blocked/')) return;

  const geo = request.geo || {};
  const country = geo.country;
  const region = geo.countryRegion;

  const blocked = country === 'UA' && (!region || !UA_ALLOWED_REGIONS.has(region));
  if (!blocked) return;

  if (path.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'geo_blocked' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/blocked',
      'Cache-Control': 'no-store',
    },
  });
}

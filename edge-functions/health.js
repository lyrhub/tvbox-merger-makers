/**
 * /health 健康检查
 */
export async function onRequest() {
  console.log('[health] ok');
  return new Response('OK', { status: 200 });
}

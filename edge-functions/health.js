/**
 * /health 健康检查
 */
export async function onRequest() {
  return new Response('OK', { status: 200 });
}

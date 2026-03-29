export async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: pushToken,
        title,
        body,
        data,
        sound: 'default',
      }),
    });
    const result = await response.json();
    console.log('[push] Notification sent:', result);
    return result;
  } catch (err) {
    console.error('[push] Failed to send notification:', err);
  }
}

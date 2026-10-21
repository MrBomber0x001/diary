const input = document.getElementById('applicationUrl');
const statusElement = document.getElementById('status');

function validateApplicationUrl(value) {
  const url = new URL(value);
  const localHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'http:' || !localHost) {
    throw new Error('استخدم رابطاً محلياً مثل http://127.0.0.1:4178.');
  }
  if (url.username || url.password) throw new Error('لا تضع اسم المستخدم أو كلمة المرور في الرابط.');
  return `${url.origin}/`;
}

chrome.storage.local.get({ applicationUrl: 'http://127.0.0.1:4178' }).then(settings => {
  input.value = settings.applicationUrl;
});

document.getElementById('saveButton').addEventListener('click', async () => {
  try {
    const applicationUrl = validateApplicationUrl(input.value.trim());
    await chrome.storage.local.set({ applicationUrl });
    input.value = applicationUrl;
    statusElement.textContent = 'تم حفظ رابط التطبيق.';
  } catch (error) {
    statusElement.textContent = error.message;
  }
});

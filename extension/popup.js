const statusElement = document.getElementById('status');
const saveButton = document.getElementById('saveButton');
let capture;
let applicationUrl;

function validateApplicationUrl(value) {
  const url = new URL(value);
  const localHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (!localHost || url.protocol !== 'http:') {
    throw new Error('استخدم عنوان التطبيق المحلي مثل http://127.0.0.1:4178.');
  }
  if (url.username || url.password) throw new Error('لا تضع بيانات الدخول داخل رابط التطبيق.');
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

async function initialize() {
  try {
    const settings = await chrome.storage.local.get({ applicationUrl: 'http://127.0.0.1:4178' });
    applicationUrl = validateApplicationUrl(settings.applicationUrl);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [page] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [document.getElementById('includeSnapshot').checked],
      func: includeSnapshot => ({
        title: document.title.trim(),
        url: location.href,
        description: document.querySelector('meta[name="description"],meta[property="og:description"]')?.content?.trim() || '',
        excerpt: window.getSelection()?.toString().trim() || '',
        readableText: includeSnapshot ? (document.body?.innerText || '').trim().slice(0, 4500) : '',
      }),
    });
    capture = page.result;
    if (!/^https?:$/.test(new URL(capture.url).protocol)) throw new Error('لا يمكن حفظ هذا النوع من الصفحات.');
    if (!capture.title || capture.title.length > 300 || capture.url.length > 2048) {
      throw new Error('تعذّر قراءة عنوان أو رابط صالح من الصفحة.');
    }
    capture.description = capture.description.slice(0, 300);
    capture.excerpt = capture.excerpt.slice(0, 500);
    capture.readableText = capture.readableText.slice(0, 4500);
    saveButton.disabled = false;
    statusElement.textContent = capture.title;
  } catch (error) {
    statusElement.textContent = error.message || 'تعذّر قراءة الصفحة الحالية.';
  }
}

saveButton.addEventListener('click', async () => {
  saveButton.disabled = true;
  try {
    const target = new URL(applicationUrl);
    const bytes = new TextEncoder().encode(JSON.stringify(capture));
    const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
    const encodedCapture = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    target.hash = new URLSearchParams({ capture: encodedCapture }).toString();
    await chrome.tabs.create({ url: target.href });
    statusElement.textContent = 'تم فتح مذكرتي في تبويب جديد. سيظهر تأكيد الحفظ داخل التطبيق بعد تسجيل الدخول.';
    saveButton.textContent = 'تم الإرسال';
  } catch (error) {
    statusElement.textContent = error.message;
    saveButton.disabled = false;
  }
});

document.getElementById('settingsButton').addEventListener('click', () => chrome.runtime.openOptionsPage());
initialize();

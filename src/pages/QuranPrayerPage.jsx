import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { messages } from '../i18n.js';

export default function QuranPrayerPage({ language, activeAudio, onPlayAudio, onUnauthorized }) {
  const [surahs, setSurahs] = useState([]);
  const [surah, setSurah] = useState(null);
  const [timings, setTimings] = useState(null);
  const [stations, setStations] = useState([]);
  const [station, setStation] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');
  const t = messages[language];
  useEffect(() => {
    fetch('https://api.alquran.cloud/v1/surah').then(response => response.json())
      .then(result => setSurahs(result.data || [])).catch(() => setError(language === 'ar' ? 'تعذّر تحميل فهرس القرآن.' : 'Could not load the surah index.'));
    fetch('https://mp3quran.net/api/v3/radios?language=ar').then(response => {
      if (!response.ok) throw new Error('Radio stations are unavailable.');
      return response.json();
    }).then(result => {
      const list = Array.isArray(result.radios) ? result.radios : [];
      setStations(list);
      setStation(list[0]?.url || '');
    }).catch(() => setError(language === 'ar' ? 'تعذّر تحميل محطات القرآن الصوتية.' : 'Could not load Quran radio stations.'));
    api('/settings').then(settings => {
      setLocation(settings.prayerLocation || '');
      if (settings.prayerLatitude !== null && settings.prayerLongitude !== null) {
        const date = new Date().toLocaleDateString('en-GB').replaceAll('/', '-');
        return fetch(`https://api.aladhan.com/v1/timings/${date}?latitude=${settings.prayerLatitude}&longitude=${settings.prayerLongitude}&method=${settings.prayerMethod || 5}`)
          .then(response => response.json()).then(result => setTimings(result.data?.timings || null));
      }
      return null;
    }).catch(failure => {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    });
  }, [language, onUnauthorized]);

  async function loadSurah(id) {
    setError('');
    try {
      const response = await fetch(`https://api.alquran.cloud/v1/surah/${id}/ar.alafasy`);
      const result = await response.json();
      if (!response.ok || !result.data) throw new Error('تعذّر تحميل السورة.');
      setSurah(result.data);
    } catch (failure) { setError(failure.message); }
  }
  return <section className="page-card quran-page">
    <header className="quran-hero"><div><p className="eyebrow">عبادة وسكينة</p><h1>{t.quran}</h1><p>{location || (language === 'ar' ? 'وردك اليومي وأوقات الصلاة في مكان واحد' : 'Your daily recitation and prayer times')}</p></div><span aria-hidden="true">۞</span></header>
    {error && <p className="notice error" role="alert">{error}</p>}
    <section className="prayer-section">
      <header className="quran-section-heading"><div><h2>مواقيت الصلاة</h2><p>{language === 'ar' ? 'جدول صلواتك اليومية' : 'Your daily prayer schedule'}</p></div><span aria-hidden="true">☼</span></header>
      {timings ? <div className="prayer-grid">{[['Fajr', 'الفجر', 'Fajr'], ['Sunrise', 'الشروق', 'Sunrise'], ['Dhuhr', 'الظهر', 'Dhuhr'], ['Asr', 'العصر', 'Asr'], ['Maghrib', 'المغرب', 'Maghrib'], ['Isha', 'العشاء', 'Isha']].map(([key, arabicLabel, englishLabel]) =>
        <article className={`prayer-time-card prayer-${key.toLowerCase()}`} key={key}><span className="prayer-symbol" aria-hidden="true">{key === 'Sunrise' ? '☀' : '◷'}</span><strong>{timings[key]}</strong><span>{language === 'ar' ? arabicLabel : englishLabel}</span></article>)}</div> :
        <p className="notice">{language === 'ar' ? 'أضف إحداثيات موقعك في الإعدادات لعرض مواقيت الصلاة.' : 'Add your coordinates in Settings to see prayer times.'}</p>}
    </section>
    <section className="radio-station-panel">
      <div className="radio-station-copy"><span className="radio-live-indicator"><i /> {language === 'ar' ? 'إذاعة مباشرة' : 'LIVE RADIO'}</span><h2>{language === 'ar' ? 'إذاعة القرآن الكريم' : 'Quran Radio'}</h2><p>{language === 'ar' ? 'استمع إلى تلاوات متواصلة أثناء القراءة أو التركيز.' : 'Listen to continuous recitation while reading or focusing.'}</p>
        <label>{language === 'ar' ? 'المحطة' : 'Station'}<select value={station} onChange={event => setStation(event.target.value)} disabled={!stations.length}>
          {stations.map(row => <option key={row.id} value={row.url}>{row.name}</option>)}
        </select></label>
      </div><div className="radio-disc" aria-hidden="true">۞</div>
      {station && <button className="button button-primary radio-play-button" type="button" onClick={() => onPlayAudio({
        src: station,
        title: `${language === 'ar' ? 'إذاعة القرآن' : 'Quran Radio'} · ${stations.find(row => row.url === station)?.name || ''}`,
      })}>{activeAudio?.src === station ? (language === 'ar' ? 'تعمل الآن في المشغل أعلى الصفحة' : 'Playing in the page player') : (language === 'ar' ? 'تشغيل الإذاعة' : 'Play radio')}</button>}
    </section>
    <section className="quran-reading-section">
      <header className="quran-section-heading"><div><h2>القرآن الكريم</h2><p>{language === 'ar' ? 'اختر سورة للقراءة والاستماع' : 'Choose a surah to read and listen'}</p></div></header>
      <label className="surah-select-label">{language === 'ar' ? 'السورة' : 'Surah'}<select value={surah?.number || ''} onChange={event => event.target.value && loadSurah(event.target.value)}>
        <option value="">{language === 'ar' ? '— اختر سورة —' : '— Select a surah —'}</option>{surahs.map(row => <option key={row.number} value={row.number}>{row.number}. {language === 'ar' ? row.name : row.englishName}</option>)}
      </select></label>
      {surah && <article className="quran-surah">
        <header><span>{String(surah.number).padStart(3, '0')}</span><div><h3>{language === 'ar' ? surah.name : surah.englishName}</h3><p>{language === 'ar' ? `${surah.englishName} · ${surah.numberOfAyahs} آية` : `${surah.numberOfAyahs} verses`}</p></div>
          {surah.ayahs?.[0]?.audio && <button className="button button-quiet" type="button" onClick={() => onPlayAudio({
            src: surah.ayahs[0].audio,
            title: `${language === 'ar' ? 'سورة' : 'Surah'} ${surah.name}`,
          })}>{activeAudio?.src === surah.ayahs[0].audio ? (language === 'ar' ? 'تعمل الآن' : 'Playing') : (language === 'ar' ? 'استمع للسورة' : 'Listen to surah')}</button>}
        </header>
        <div className="quran-reader" dir="rtl">{surah.ayahs.map(ayah => <span className="quran-ayah" key={ayah.number}>{ayah.text} <span>۞{ayah.numberInSurah}</span></span>)}</div>
      </article>}
    </section>
  </section>;
}

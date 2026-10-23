import { useEffect, useRef, useState } from 'react';
import { createAmbientSound } from '../ambientAudio.js';

const sounds = ['waves', 'rain', 'breeze'];

function stopSound(audio) {
  audio.nodes.forEach(node => {
    if (typeof node.stop === 'function') node.stop();
    node.disconnect();
  });
  audio.nodes = [];
  audio.gain = null;
}

export default function CalmAudioControl({ language }) {
  const [sound, setSound] = useState('');
  const [volume, setVolume] = useState(24);
  const [error, setError] = useState('');
  const audio = useRef({ context: null, nodes: [], gain: null, gainScale: 0.5 });
  const isArabic = language === 'ar';

  useEffect(() => () => stopSound(audio.current), []);

  async function chooseSound(next) {
    setError('');
    if (!next || sound === next) {
      stopSound(audio.current);
      setSound('');
      return;
    }
    stopSound(audio.current);
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextType) {
      setError(isArabic ? 'الصوت غير مدعوم في هذا المتصفح.' : 'Audio is not supported in this browser.');
      return;
    }
    try {
      const context = audio.current.context || new AudioContextType();
      audio.current.context = context;
      await context.resume();
      const playback = createAmbientSound(context, next, volume);
      audio.current.nodes = playback.nodes;
      audio.current.gain = playback.gain;
      audio.current.gainScale = playback.gainScale;
      setSound(next);
    } catch (failure) {
      setError(failure.message || (isArabic ? 'تعذّر تشغيل الصوت.' : 'Could not start the sound.'));
    }
  }

  function changeVolume(event) {
    const next = Number(event.target.value);
    setVolume(next);
    if (audio.current.gain) {
      audio.current.gain.gain.setTargetAtTime(
        next / 100 * audio.current.gainScale,
        audio.current.context.currentTime,
        0.08,
      );
    }
  }

  return <div className="calm-sound-control">
    <label className="calm-sound-picker">
      <span aria-hidden="true">♫</span>
      <select value={sound} onChange={event => void chooseSound(event.target.value)}
        aria-label={isArabic ? 'صوت الخلفية' : 'Ambient sound'}>
        <option value="">{isArabic ? 'بدون صوت' : 'Sound off'}</option>
        <option value="waves">{isArabic ? 'أمواج البحر' : 'Ocean waves'}</option>
        <option value="rain">{isArabic ? 'مطر هادئ' : 'Soft rain'}</option>
        <option value="breeze">{isArabic ? 'نسيم' : 'Gentle breeze'}</option>
      </select>
    </label>
    {sound && <label className="calm-volume-picker">
      <span className="sr-only">{isArabic ? 'مستوى الصوت' : 'Volume'}</span>
      <input type="range" min="0" max="60" value={volume} onChange={changeVolume}
        aria-label={isArabic ? 'مستوى الصوت' : 'Volume'} />
    </label>}
    {error && <span className="calm-sound-error" role="alert">{error}</span>}
  </div>;
}

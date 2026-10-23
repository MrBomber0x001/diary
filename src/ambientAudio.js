export function createAmbientSound(context, kind, volume) {
  const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let filteredNoise = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const whiteNoise = Math.random() * 2 - 1;
    filteredNoise = kind === 'waves'
      ? filteredNoise * 0.996 + whiteNoise * 0.035
      : kind === 'breeze'
        ? filteredNoise * 0.94 + whiteNoise * 0.12
        : whiteNoise;
    samples[index] = filteredNoise;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = kind === 'rain' ? 'highpass' : 'lowpass';
  filter.frequency.value = kind === 'waves' ? 340 : kind === 'breeze' ? 620 : 900;
  const rainSoftener = kind === 'rain' ? context.createBiquadFilter() : null;
  if (rainSoftener) {
    rainSoftener.type = 'lowpass';
    rainSoftener.frequency.value = 4200;
  }
  const gain = context.createGain();
  const gainScale = kind === 'rain' ? 0.19 : 0.5;
  gain.gain.value = volume / 100 * gainScale;
  source.connect(filter);
  filter.connect(rainSoftener || gain);
  if (rainSoftener) rainSoftener.connect(gain);
  gain.connect(context.destination);
  const nodes = [source];
  if (kind === 'waves') {
    const swell = context.createOscillator();
    const swellDepth = context.createGain();
    swell.frequency.value = 0.09;
    swellDepth.gain.value = 0.13;
    swell.connect(swellDepth);
    swellDepth.connect(gain.gain);
    swell.start();
    nodes.push(swell);
  }
  source.start();
  nodes.push(filter, ...(rainSoftener ? [rainSoftener] : []), gain);
  return { nodes, gain, gainScale };
}

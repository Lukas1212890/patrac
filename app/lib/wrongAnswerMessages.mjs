export const WRONG_ANSWER_MESSAGES = Object.freeze([
  'Tahle stopa nikam nevede. Zkus jinou odpověď.',
  'Zámek se ani nehnul. Zkus to znovu!',
  'Dobrý pokus, pátrači. Tajemství ale zatím zůstává skryté.',
  'Poklad si ještě chvíli počká. Tahle odpověď nesedí.',
  'Tudy cesta nevede. Vrať se k hádance.',
  'Stopík zavrtěl hlavou. Zkus to ještě jednou!',
  'Šifra zatím odolává. Nevzdávej to!',
  'Vedle! I nejlepší pátrač občas zabloudí.',
]);
export function nextWrongAnswerMessage(previous, random = Math.random) {
  const choices = WRONG_ANSWER_MESSAGES.filter(message => message !== previous);
  return choices[Math.floor(random() * choices.length)];
}

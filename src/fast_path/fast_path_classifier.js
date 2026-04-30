function classifyFastPath(input = "", triggers = {}) {
  const text = input.toLowerCase();

  for (const key of Object.keys(triggers)) {
    const words = triggers[key];
    if (words.some(w => text.includes(w))) {
      return key;
    }
  }

  return null;
}

module.exports = { classifyFastPath };

function validNarrative(text) {
  return typeof text === 'string' && text.trim().length > 0 && text.length <= 160 &&
    !/your response|I need to|I'll output|instruction|format expects|sentiment classification|AI call failed|AI key not configured|RESPONSE:|SENTIMENT:/i.test(text) &&
    !/\p{Extended_Pictographic}/u.test(text);
}
module.exports = { validNarrative };

function parseCsvRows(source) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field.length === 0) quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      row.push(field);
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      field = '';
      if (character === '\r' && source[index + 1] === '\n') index += 1;
    } else field += character;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  row.push(field);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

function normalizeImportedCard(card, index) {
  const value = (key, alias) => card?.[key] ?? (alias ? card?.[alias] : undefined);
  const question = value('question');
  const answer = value('answer', 'sample_answer') ?? value('sampleAnswer');
  const answerNotes = value('answer_notes', 'answerNotes') ?? value('notes') ?? '';
  const tags = value('tags') ?? '';
  const difficulty = value('difficulty') || 'intermediate';
  if (typeof question !== 'string' || !question.trim() || question.length > 5000) {
    throw new Error(`Row ${index}: question is required and must be at most 5000 characters.`);
  }
  if (typeof answer !== 'string' || !answer.trim() || answer.length > 10000) {
    throw new Error(`Row ${index}: answer is required and must be at most 10000 characters.`);
  }
  if (typeof answerNotes !== 'string' || answerNotes.length > 4000) {
    throw new Error(`Row ${index}: answer notes must be at most 4000 characters.`);
  }
  const tagList = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',') : null;
  if (!tagList || tagList.length > 12 || tagList.some(tag => typeof tag !== 'string' || tag.trim().length > 40)) {
    throw new Error(`Row ${index}: tags must be up to 12 labels, each at most 40 characters.`);
  }
  if (!['beginner', 'intermediate', 'advanced'].includes(difficulty)) {
    throw new Error(`Row ${index}: difficulty must be beginner, intermediate, or advanced.`);
  }
  return {
    question: question.trim(),
    answer: answer.trim(),
    answer_notes: answerNotes.trim(),
    tags: tagList.map(tag => tag.trim()).filter(Boolean),
    difficulty,
  };
}

export function parseQuestionImport(format, source) {
  if (format === 'json') {
    const parsed = JSON.parse(source);
    if (!Array.isArray(parsed)) throw new Error('JSON must contain an array of question objects.');
    if (parsed.length === 0) throw new Error('JSON must contain at least one question.');
    if (parsed.length > 500) throw new Error('Import is limited to 500 questions at a time.');
    return parsed.map((card, index) => normalizeImportedCard(card, index + 1));
  }
  if (format !== 'csv') throw new Error('Choose CSV or JSON format.');
  const records = parseCsvRows(source.replace(/^\uFEFF/, ''));
  if (records.length < 2) throw new Error('CSV must include a header row and at least one question.');
  const headers = records[0].map(header => header.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const questionIndex = headers.indexOf('question');
  const answerIndex = ['answer', 'sample_answer', 'sampleanswer'].map(name => headers.indexOf(name)).find(index => index >= 0);
  if (questionIndex < 0 || answerIndex === undefined) throw new Error('CSV headers must include question and answer.');
  if (records.length - 1 > 500) throw new Error('Import is limited to 500 questions at a time.');
  return records.slice(1).map((record, index) => {
    if (record.length !== headers.length) throw new Error(`CSV row ${index + 2} has a different number of columns than the header.`);
    const get = (...names) => {
      const column = names.map(name => headers.indexOf(name)).find(position => position >= 0);
      return column === undefined ? '' : record[column];
    };
    return normalizeImportedCard({
      question: record[questionIndex],
      answer: record[answerIndex],
      answer_notes: get('answer_notes', 'notes'),
      tags: get('tags'),
      difficulty: get('difficulty') || 'intermediate',
    }, index + 2);
  });
}

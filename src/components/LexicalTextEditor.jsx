import { useEffect, useRef, useState } from 'react';
import { $createParagraphNode, $createTextNode, $getRoot, $getSelection, $isRangeSelection, COMMAND_PRIORITY_EDITOR, FORMAT_TEXT_COMMAND, INSERT_TAB_COMMAND, KEY_TAB_COMMAND } from 'lexical';
import { LinkNode } from '@lexical/link';
import { $isListItemNode, ListItemNode, ListNode } from '@lexical/list';
import { $convertFromMarkdownString, $convertToMarkdownString, TRANSFORMERS } from '@lexical/markdown';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { CodeNode } from '@lexical/code';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import MarkdownContent from './MarkdownContent.jsx';

function setEditorValue(value, markdown) {
  if (markdown) {
    $convertFromMarkdownString(value || '', TRANSFORMERS);
    return;
  }
  const root = $getRoot();
  root.clear();
  String(value || '').split('\n').forEach(line => root.append($createParagraphNode().append($createTextNode(line))));
}

function editorText(editorState, markdown) {
  if (markdown) return editorState.read(() => $convertToMarkdownString(TRANSFORMERS));
  return editorState.read(() => $getRoot().getChildren().map(node => node.getTextContent()).join('\n'));
}

function ValueSyncPlugin({ value, markdown, onChange }) {
  const [editor] = useLexicalComposerContext();
  const lastValue = useRef(value || '');
  useEffect(() => {
    if ((value || '') === lastValue.current) return;
    lastValue.current = value || '';
    editor.update(() => setEditorValue(lastValue.current, markdown));
  }, [editor, markdown, value]);
  return <OnChangePlugin onChange={editorState => {
    const nextValue = editorText(editorState, markdown);
    lastValue.current = nextValue;
    onChange(nextValue);
  }} ignoreSelectionChange />;
}

function $changeListItemIndent(delta) {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;

  let node = selection.anchor.getNode();
  while (node && !$isListItemNode(node)) node = node.getParent();
  if (!$isListItemNode(node)) return false;

  if (delta > 0 && !$isListItemNode(node.getPreviousSibling())) return true;
  node.setIndent(Math.max(0, Math.min(6, node.getIndent() + delta)));
  return true;
}

function ListTabIndentationPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => editor.registerCommand(KEY_TAB_COMMAND, event => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return false;

    event.preventDefault();
    if ($changeListItemIndent(event.shiftKey ? -1 : 1)) return true;
    return editor.dispatchCommand(INSERT_TAB_COMMAND);
  }, COMMAND_PRIORITY_EDITOR), [editor]);
  return null;
}

function ImageDropPlugin({ onImageUpload, onError }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root || !onImageUpload) return undefined;
    function onDragOver(event) {
      if ([...event.dataTransfer.types].includes('Files')) event.preventDefault();
    }
    function onDrop(event) {
      const file = [...event.dataTransfer.files].find(candidate => candidate.type.startsWith('image/'));
      if (!file) return;
      event.preventDefault();
      onError('');
      onImageUpload(file).then(markdown => {
        if (markdown) editor.update(() => {
          const selection = $getSelection();
          if (selection && 'insertText' in selection) selection.insertText(markdown);
        });
      }).catch(failure => onError(failure.message));
    }
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('drop', onDrop);
    return () => {
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('drop', onDrop);
    };
  }, [editor, onError, onImageUpload]);
  return null;
}

function ToolbarPlugin({ language, onImageUpload, onError, onChangePreview }) {
  const [editor] = useLexicalComposerContext();
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);
  const isArabic = language === 'ar';

  function insertMarkdown(before, after = '') {
    editor.update(() => {
      const selection = $getSelection();
      if (!selection || !('insertText' in selection)) return;
      const selected = selection.getTextContent() || (isArabic ? 'نص' : 'text');
      selection.insertText(`${before}${selected}${after}`);
    });
  }

  function changeListIndent(delta) {
    editor.update(() => $changeListItemIndent(delta));
  }

  async function upload(file) {
    if (!file || !onImageUpload) return;
    setUploading(true);
    onError('');
    try {
      const markdown = await onImageUpload(file);
      if (markdown) editor.update(() => {
        const selection = $getSelection();
        if (selection && 'insertText' in selection) selection.insertText(markdown);
      });
    } catch (failure) {
      onError(failure.message);
    } finally {
      setUploading(false);
    }
  }

  return <div className="markdown-toolbar" aria-label={isArabic ? 'تنسيق Markdown' : 'Markdown formatting'}>
    <button type="button" title="Heading" onClick={() => insertMarkdown('## ')}>H</button>
    <button type="button" title="Bold" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}><strong>B</strong></button>
    <button type="button" title="Italic" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}><em>I</em></button>
    <button type="button" title="Quote" onClick={() => insertMarkdown('> ')}>❞</button>
    <button type="button" title="Bullet list" onClick={() => insertMarkdown('- ')}>•</button>
    <button type="button" title={isArabic ? 'زيادة إزاحة عنصر القائمة' : 'Indent list item'}
      aria-label={isArabic ? 'زيادة إزاحة عنصر القائمة' : 'Indent list item'}
      onMouseDown={event => event.preventDefault()} onClick={() => changeListIndent(1)}>⇥</button>
    <button type="button" title={isArabic ? 'تقليل إزاحة عنصر القائمة' : 'Outdent list item'}
      aria-label={isArabic ? 'تقليل إزاحة عنصر القائمة' : 'Outdent list item'}
      onMouseDown={event => event.preventDefault()} onClick={() => changeListIndent(-1)}>⇤</button>
    <button type="button" title="Link" onClick={() => insertMarkdown('[', '](https://)')}>↗</button>
    <button type="button" title="Image" onClick={() => insertMarkdown('![', '](https://image-url)')}>▧</button>
    <button type="button" title={isArabic ? 'رفع صورة' : 'Upload image'} disabled={uploading || !onImageUpload} onClick={() => fileInput.current?.click()}>
      {uploading ? '…' : '⬆'}
    </button>
    <input ref={fileInput} className="file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif"
      onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
    <button type="button" className="markdown-preview-toggle" aria-label={isArabic ? 'معاينة' : 'Preview'} title={isArabic ? 'معاينة' : 'Preview'} onClick={onChangePreview}>
      <span aria-hidden="true">◉</span>
    </button>
  </div>;
}

export default function LexicalTextEditor({ id, value, onChange, language, code = false, plainText = false, placeholder, onImageUpload, onImageError, onError, autoFocus }) {
  const markdown = !code && !plainText;
  const [preview, setPreview] = useState(false);
  const lastValue = useRef(value || '');
  const initialConfig = {
    namespace: `PersonalMemo-${code ? 'Code' : plainText ? 'PlainText' : 'Text'}`,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, CodeNode],
    onError: error => { throw error; },
    editorState: () => {
      setEditorValue(value || '', markdown);
      lastValue.current = value || '';
    },
    theme: {
      paragraph: 'lexical-paragraph',
      text: { bold: 'lexical-bold', italic: 'lexical-italic', underline: 'lexical-underline', code: 'lexical-inline-code' },
      heading: { h1: 'lexical-heading', h2: 'lexical-heading', h3: 'lexical-heading' },
      list: { listitem: 'lexical-list-item', nested: { listitem: 'lexical-nested-list-item' }, ol: 'lexical-ordered-list', ul: 'lexical-unordered-list' },
      quote: 'lexical-quote',
      link: 'lexical-link',
      code: 'lexical-code',
    },
  };

  if (preview && markdown) return <div className="markdown-editor-preview">
    <MarkdownContent>{value}</MarkdownContent>
    <button className="button button-quiet" type="button" onClick={() => setPreview(false)}>{language === 'ar' ? 'العودة للتحرير' : 'Return to editing'}</button>
  </div>;

  return <div className={`lexical-editor${code ? ' lexical-code-editor' : ''}`}>
    <LexicalComposer initialConfig={initialConfig}>
      {markdown && <LexicalToolbarPlugin language={language} onImageUpload={onImageUpload} onError={onImageError || onError} onChangePreview={() => setPreview(true)} />}
      <RichTextPlugin
        contentEditable={<ContentEditable id={id} className="lexical-content-editable" dir={code ? 'ltr' : 'auto'} aria-label={placeholder || (language === 'ar' ? 'محرر النص' : 'Text editor')} spellCheck={!code} autoFocus={autoFocus} />}
        placeholder={<div className="lexical-placeholder">{placeholder}</div>}
        ErrorBoundary={LexicalErrorBoundary}
      />
      {markdown && <ListTabIndentationPlugin />}
      <HistoryPlugin />
      {markdown && <><ListPlugin /><LinkPlugin /><MarkdownShortcutPlugin transformers={TRANSFORMERS} /></>}
      <ValueSyncPlugin value={value} markdown={markdown} onChange={onChange} />
      {markdown && onImageUpload && <ImageDropPlugin onImageUpload={onImageUpload} onError={onImageError || onError} />}
    </LexicalComposer>
  </div>;
}

function LexicalToolbarPlugin({ language, onImageUpload, onError, onChangePreview }) {
  return <ToolbarPlugin language={language} onImageUpload={onImageUpload} onError={onError} onChangePreview={onChangePreview} />;
}

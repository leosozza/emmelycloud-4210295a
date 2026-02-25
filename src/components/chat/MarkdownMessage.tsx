import React from "react";

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function MarkdownMessage({ content }: { content: string }) {
  const html = renderMarkdown(content);
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none break-words [&_pre]:bg-muted [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-4"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderMarkdown(text: string): string {
  // Code blocks
  let result = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    return `<pre><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`;
  });

  // Inline code
  result = result.replace(/`([^`]+)`/g, (_m, code) => `<code>${escapeHtml(code)}</code>`);

  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Headers
  result = result.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  result = result.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  result = result.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Unordered lists
  result = result.replace(/^- (.+)$/gm, "<li>$1</li>");
  result = result.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");

  // Ordered lists
  result = result.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  // Line breaks (but not inside pre/code)
  result = result.replace(/\n/g, "<br>");

  // Clean up double <br> after block elements
  result = result.replace(/(<\/(?:pre|ul|ol|h[1-3]|li)>)<br>/g, "$1");
  result = result.replace(/<br>(<(?:pre|ul|ol|h[1-3]))/g, "$1");

  return result;
}

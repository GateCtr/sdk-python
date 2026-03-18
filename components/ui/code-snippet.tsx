"use client";

import { useState } from "react";
import { Copy, Check, WrapText } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CodeLanguage =
  | "ts"
  | "tsx"
  | "js"
  | "jsx"
  | "python"
  | "bash"
  | "json"
  | "text";

export type CalloutVariant = "success" | "info" | "warning" | "error";

export type CodeSnippetTab = {
  /** Tab label shown in the header */
  label: string;
  /** Raw code string */
  code: string;
  language?: CodeLanguage;
  /** 1-based line numbers to highlight (yellow gutter + bg tint) */
  highlightLines?: number[];
  /** Optional callout shown below the code block */
  callout?: string;
  calloutVariant?: CalloutVariant;
};

export interface CodeSnippetProps {
  tabs: CodeSnippetTab[];
  /** Filename shown in the header (overrides single-tab label) */
  filename?: string;
  defaultTab?: number;
  className?: string;
  /** Show macOS window chrome dots — default true */
  chrome?: boolean;
  /** Show line numbers — default false */
  showLineNumbers?: boolean;
  /** Max visible height before scroll (e.g. "320px") */
  maxHeight?: string;
  /** Allow toggling word-wrap — default false */
  allowWrap?: boolean;
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────

type TokenType =
  | "comment"
  | "string"
  | "template"
  | "keyword"
  | "builtin"
  | "number"
  | "operator"
  | "punctuation"
  | "function"
  | "property"
  | "deleted"
  | "added"
  | "plain";

type Token = { type: TokenType; value: string };

const JS_KEYWORDS = new Set([
  "const",
  "let",
  "var",
  "import",
  "from",
  "export",
  "default",
  "async",
  "await",
  "return",
  "function",
  "class",
  "new",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "try",
  "catch",
  "finally",
  "throw",
  "typeof",
  "instanceof",
  "in",
  "of",
  "void",
  "delete",
  "yield",
  "static",
  "extends",
  "super",
  "this",
  "true",
  "false",
  "null",
  "undefined",
  "NaN",
  "Infinity",
]);

const JS_BUILTINS = new Set([
  "console",
  "process",
  "require",
  "module",
  "exports",
  "Promise",
  "Array",
  "Object",
  "String",
  "Number",
  "Boolean",
  "Error",
  "JSON",
  "Math",
  "Date",
  "RegExp",
  "Map",
  "Set",
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "fetch",
  "Response",
  "Request",
  "Headers",
  "URL",
  "URLSearchParams",
  "Buffer",
  "ReadableStream",
]);

const PY_KEYWORDS = new Set([
  "def",
  "class",
  "import",
  "from",
  "as",
  "return",
  "if",
  "elif",
  "else",
  "for",
  "while",
  "try",
  "except",
  "finally",
  "raise",
  "with",
  "pass",
  "break",
  "continue",
  "lambda",
  "yield",
  "async",
  "await",
  "True",
  "False",
  "None",
  "and",
  "or",
  "not",
  "in",
  "is",
  "global",
  "nonlocal",
  "del",
  "assert",
]);

const PY_BUILTINS = new Set([
  "print",
  "len",
  "range",
  "type",
  "str",
  "int",
  "float",
  "list",
  "dict",
  "set",
  "tuple",
  "bool",
  "open",
  "input",
  "super",
  "self",
  "cls",
  "enumerate",
  "zip",
  "map",
  "filter",
  "sorted",
  "reversed",
  "any",
  "all",
  "min",
  "max",
  "sum",
  "abs",
  "round",
]);

function tokenizeLine(line: string, lang: CodeLanguage): Token[] {
  const isPy = lang === "python";

  // Full-line comment
  if (/^\s*(\/\/|#)/.test(line)) return [{ type: "comment", value: line }];
  // Diff markers (must be at col 0)
  if (line.startsWith("- ") || line === "-")
    return [{ type: "deleted", value: line }];
  if (line.startsWith("+ ") || line === "+")
    return [{ type: "added", value: line }];

  const tokens: Token[] = [];
  let rest = line;

  while (rest.length > 0) {
    // Inline comment
    const inlineComment = rest.match(/^(\/\/.*|#.*)/);
    if (inlineComment) {
      tokens.push({ type: "comment", value: inlineComment[1] });
      break;
    }

    // Template literal (backtick)
    if (rest[0] === "`") {
      const end = rest.indexOf("`", 1);
      const val = end === -1 ? rest : rest.slice(0, end + 1);
      tokens.push({ type: "template", value: val });
      rest = rest.slice(val.length);
      continue;
    }

    // String (double or single quote)
    const strMatch = rest.match(/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/);
    if (strMatch) {
      tokens.push({ type: "string", value: strMatch[1] });
      rest = rest.slice(strMatch[1].length);
      continue;
    }

    // Number
    const numMatch = rest.match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?/);
    if (
      numMatch &&
      (tokens.length === 0 ||
        tokens[tokens.length - 1].type !== "plain" ||
        /[\s(,=:[\{]$/.test(tokens[tokens.length - 1].value))
    ) {
      tokens.push({ type: "number", value: numMatch[0] });
      rest = rest.slice(numMatch[0].length);
      continue;
    }

    // Identifier — keyword / builtin / function / property / plain
    const identMatch = rest.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (identMatch) {
      const word = identMatch[1];
      const after = rest.slice(word.length).trimStart();
      const keywords = isPy ? PY_KEYWORDS : JS_KEYWORDS;
      const builtins = isPy ? PY_BUILTINS : JS_BUILTINS;

      let type: TokenType = "plain";
      if (keywords.has(word)) type = "keyword";
      else if (builtins.has(word)) type = "builtin";
      else if (after.startsWith("(")) type = "function";
      else if (tokens.length > 0 && tokens[tokens.length - 1].value === ".")
        type = "property";

      tokens.push({ type, value: word });
      rest = rest.slice(word.length);
      continue;
    }

    // Operator
    const opMatch = rest.match(
      /^(===|!==|=>|>=|<=|&&|\|\||[+\-*/%=<>!&|^~?:])/,
    );
    if (opMatch) {
      tokens.push({ type: "operator", value: opMatch[1] });
      rest = rest.slice(opMatch[1].length);
      continue;
    }

    // Punctuation
    const punctMatch = rest.match(/^[{}()[\].,;]/);
    if (punctMatch) {
      tokens.push({ type: "punctuation", value: punctMatch[0] });
      rest = rest.slice(1);
      continue;
    }

    // Fallback — consume one char as plain
    tokens.push({ type: "plain", value: rest[0] });
    rest = rest.slice(1);
  }

  return tokens.length > 0 ? tokens : [{ type: "plain", value: line }];
}

function tokenize(code: string, lang: CodeLanguage = "ts"): Token[][] {
  // JSON — simple pass-through with string/number/keyword coloring
  if (lang === "json") {
    return code.split("\n").map((line) => {
      const tokens: Token[] = [];
      let rest = line;
      while (rest.length > 0) {
        const strMatch = rest.match(/^("(?:[^"\\]|\\.)*")/);
        if (strMatch) {
          tokens.push({ type: "string", value: strMatch[1] });
          rest = rest.slice(strMatch[1].length);
          continue;
        }
        const numMatch = rest.match(/^-?\d+(\.\d+)?/);
        if (numMatch) {
          tokens.push({ type: "number", value: numMatch[0] });
          rest = rest.slice(numMatch[0].length);
          continue;
        }
        const kwMatch = rest.match(/^(true|false|null)/);
        if (kwMatch) {
          tokens.push({ type: "keyword", value: kwMatch[1] });
          rest = rest.slice(kwMatch[1].length);
          continue;
        }
        tokens.push({ type: "plain", value: rest[0] });
        rest = rest.slice(1);
      }
      return tokens.length > 0 ? tokens : [{ type: "plain", value: line }];
    });
  }

  // Bash — commands and flags
  if (lang === "bash") {
    return code.split("\n").map((line) => {
      if (/^\s*#/.test(line)) return [{ type: "comment", value: line }];
      const tokens: Token[] = [];
      let rest = line;
      while (rest.length > 0) {
        const strMatch = rest.match(/^("(?:[^"\\]|\\.)*"|'[^']*')/);
        if (strMatch) {
          tokens.push({ type: "string", value: strMatch[1] });
          rest = rest.slice(strMatch[1].length);
          continue;
        }
        const flagMatch = rest.match(/^(--?[a-zA-Z][-a-zA-Z0-9]*)/);
        if (flagMatch) {
          tokens.push({ type: "operator", value: flagMatch[1] });
          rest = rest.slice(flagMatch[1].length);
          continue;
        }
        const cmdMatch = rest.match(/^([a-zA-Z_][a-zA-Z0-9_.-]*)/);
        if (cmdMatch) {
          const isBashCmd = [
            "npm",
            "npx",
            "pnpm",
            "yarn",
            "node",
            "python",
            "pip",
            "git",
            "curl",
            "export",
            "echo",
            "cd",
            "ls",
            "mkdir",
            "rm",
            "cp",
            "mv",
            "cat",
            "grep",
            "sed",
            "awk",
            "chmod",
            "sudo",
            "docker",
            "kubectl",
          ].includes(cmdMatch[1]);
          tokens.push({
            type: isBashCmd ? "builtin" : "plain",
            value: cmdMatch[1],
          });
          rest = rest.slice(cmdMatch[1].length);
          continue;
        }
        tokens.push({ type: "plain", value: rest[0] });
        rest = rest.slice(1);
      }
      return tokens.length > 0 ? tokens : [{ type: "plain", value: line }];
    });
  }

  return code.split("\n").map((line) => tokenizeLine(line, lang));
}

// ─── Token styles ─────────────────────────────────────────────────────────────

const TOKEN_CLASSES: Record<TokenType, string> = {
  comment: "text-grey-500 italic",
  string: "text-success-400",
  template: "text-warning-400",
  keyword: "text-primary-300 font-medium",
  builtin: "text-secondary-400",
  number: "text-warning-300",
  operator: "text-grey-300",
  punctuation: "text-grey-400",
  function: "text-blue-400",
  property: "text-grey-200",
  deleted: "text-error-400 line-through opacity-70",
  added: "text-success-400",
  plain: "text-grey-100",
};

const LANG_LABEL: Record<CodeLanguage, string> = {
  ts: "TypeScript",
  tsx: "TSX",
  js: "JavaScript",
  jsx: "JSX",
  python: "Python",
  bash: "Bash",
  json: "JSON",
  text: "",
};

const CALLOUT_CLASSES: Record<CalloutVariant, string> = {
  success: "bg-success-500/10 border-success-500/20 text-success-400",
  info: "bg-primary/10 border-primary/20 text-primary-300",
  warning: "bg-warning-400/10 border-warning-400/20 text-warning-400",
  error: "bg-error-500/10 border-error-500/20 text-error-400",
};

const CALLOUT_DOT: Record<CalloutVariant, string> = {
  success: "bg-success-400",
  info: "bg-primary-300",
  warning: "bg-warning-400",
  error: "bg-error-400",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function CodeSnippet({
  tabs,
  filename,
  defaultTab = 0,
  className,
  chrome = true,
  showLineNumbers = false,
  maxHeight,
  allowWrap = false,
}: CodeSnippetProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(false);

  const current = tabs[activeTab];
  const lang = current.language ?? "ts";
  const lines = tokenize(current.code, lang);
  const highlightSet = new Set(current.highlightLines ?? []);
  const calloutVariant = current.calloutVariant ?? "success";
  const langLabel = LANG_LABEL[lang];

  function handleCopy() {
    navigator.clipboard.writeText(current.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-grey-900 dark:bg-grey-950 overflow-hidden shadow-xl text-left",
        className,
      )}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-grey-800/60 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {chrome && (
            <div className="flex items-center gap-1.5 shrink-0" aria-hidden>
              <span className="size-2.5 rounded-full bg-error-500/70" />
              <span className="size-2.5 rounded-full bg-warning-400/70" />
              <span className="size-2.5 rounded-full bg-success-500/70" />
            </div>
          )}

          {/* Filename */}
          {filename && (
            <span className="text-xs font-mono text-grey-400 truncate shrink-0">
              {filename}
            </span>
          )}

          {/* Tabs */}
          {tabs.length > 1 && (
            <div className="flex gap-0.5 overflow-x-auto">
              {tabs.map((tab, i) => (
                <button
                  key={i}
                  onClick={() => setActiveTab(i)}
                  className={cn(
                    "px-3 py-1 text-xs font-mono rounded whitespace-nowrap transition-colors",
                    activeTab === i
                      ? "bg-primary/20 text-primary-300"
                      : "text-grey-400 hover:text-grey-200",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* Single tab label (when no filename) */}
          {tabs.length === 1 && tabs[0].label && !filename && (
            <span className="text-xs font-mono text-grey-400 truncate">
              {tabs[0].label}
            </span>
          )}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Language badge */}
          {langLabel && (
            <span className="hidden sm:inline-block text-[10px] font-mono text-grey-500 px-1.5 py-0.5 rounded border border-border/30 bg-grey-800/40 select-none">
              {langLabel}
            </span>
          )}

          {/* Wrap toggle */}
          {allowWrap && (
            <button
              onClick={() => setWrapped((w) => !w)}
              aria-label="Toggle word wrap"
              title="Toggle word wrap"
              className={cn(
                "p-1 rounded transition-colors",
                wrapped
                  ? "text-primary-300"
                  : "text-grey-500 hover:text-grey-200",
              )}
            >
              <WrapText className="size-3.5" />
            </button>
          )}

          {/* Copy */}
          <button
            onClick={handleCopy}
            aria-label="Copy code"
            title="Copy code"
            className="p-1 rounded text-grey-400 hover:text-grey-200 transition-colors"
          >
            {copied ? (
              <Check className="size-3.5 text-success-400" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* ── Code ── */}
      <div
        className="relative overflow-auto"
        style={maxHeight ? { maxHeight } : undefined}
      >
        {/* Scroll fade at bottom */}
        {maxHeight && (
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-linear-to-t from-grey-900 dark:from-grey-950 to-transparent z-10"
          />
        )}

        <pre
          className={cn(
            "py-4 text-xs md:text-sm font-mono leading-6",
            wrapped
              ? "whitespace-pre-wrap break-all"
              : "overflow-x-auto whitespace-pre",
          )}
        >
          <code>
            {lines.map((lineTokens, li) => {
              const lineNum = li + 1;
              const isHighlighted = highlightSet.has(lineNum);

              return (
                <span
                  key={li}
                  className={cn(
                    "flex min-w-0",
                    isHighlighted &&
                      "bg-warning-400/8 border-l-2 border-warning-400",
                  )}
                >
                  {/* Line number gutter */}
                  {showLineNumbers && (
                    <span
                      aria-hidden
                      className={cn(
                        "select-none text-right pr-4 pl-4 w-12 shrink-0 tabular-nums",
                        isHighlighted ? "text-warning-400" : "text-grey-600",
                      )}
                    >
                      {lineNum}
                    </span>
                  )}

                  {/* Code content */}
                  <span
                    className={cn("flex-1", showLineNumbers ? "pr-5" : "px-5")}
                  >
                    {lineTokens.map((token, ti) => (
                      <span key={ti} className={TOKEN_CLASSES[token.type]}>
                        {token.value}
                      </span>
                    ))}
                  </span>
                </span>
              );
            })}
          </code>
        </pre>
      </div>

      {/* ── Callout ── */}
      {current.callout && (
        <div className="px-5 pb-4">
          <div
            className={cn(
              "rounded-lg border px-3 py-2 text-xs font-mono flex items-center gap-2",
              CALLOUT_CLASSES[calloutVariant],
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full animate-pulse shrink-0",
                CALLOUT_DOT[calloutVariant],
              )}
            />
            {current.callout}
          </div>
        </div>
      )}
    </div>
  );
}

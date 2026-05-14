import { memo } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { a11yDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface CodeBlockProps {
  value: string;
  language?: string;
}

const CodeBlock: React.FC<CodeBlockProps> = memo(
  ({ language = "js", value }) => {
    return (
      <div className="max-w-full overflow-x-auto [&_pre]:my-0 [&_pre]:max-w-none">
        <SyntaxHighlighter language={language} style={a11yDark}>
          {value}
        </SyntaxHighlighter>
      </div>
    );
  }
);

CodeBlock.displayName = "CodeBlock";

export default CodeBlock;

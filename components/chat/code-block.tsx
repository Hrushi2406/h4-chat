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
      <SyntaxHighlighter language={language} style={a11yDark}>
        {value}
      </SyntaxHighlighter>
    );
  }
);

CodeBlock.displayName = "CodeBlock";

export default CodeBlock;

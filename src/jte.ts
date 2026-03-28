export const Placeholder = {
  startToken: "#~",
  endToken: "~#",
};

interface BaseNode {
  id: string;
  content: string;
  preNewLines: number;
  originalText: string;
  index: number;
  length: number;
  nodes: { [id: string]: Node };
}

export interface RootNode extends BaseNode {
  type: "root";
}

export interface ExpressionNode extends BaseNode {
  type: "expression";
  unsafe: boolean;
}

export type DirectiveKeyword =
  | "if"
  | "elseif"
  | "else"
  | "endif"
  | "for"
  | "endfor"
  | "import"
  | "param"
  | "template";

export interface DirectiveNode extends BaseNode {
  type: "directive";
  keyword: DirectiveKeyword;
}

export interface BlockNode extends BaseNode {
  type: "block";
  start: DirectiveNode;
  end: DirectiveNode;
  containsNewLines: boolean;
}

export interface CommentNode extends BaseNode {
  type: "comment";
}

export interface IgnoreNode extends BaseNode {
  type: "ignore";
}

export interface CodeNode extends BaseNode {
  type: "code";
}

export interface ContentNode extends BaseNode {
  type: "content";
}

export type Node =
  | RootNode
  | ExpressionNode
  | DirectiveNode
  | BlockNode
  | CommentNode
  | IgnoreNode
  | CodeNode
  | ContentNode;

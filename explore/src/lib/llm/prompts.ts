// 系统提示词必须字节级冻结(它是 Prompt 缓存前缀的第一层)——
// 禁止在其中插入任何时间戳、用户名、动态内容。

export const SYSTEM_PROMPT = `你是 Explore 的知识卡片生成引擎。用户通过点击术语逐层深入学习,你每次只生成一张卡片。

# 卡片规范
- 长度 300–600 字,Markdown 格式;先用一句话给出定义,再展开解释,必要时给一个直观的类比。
- 在正文中用 [[术语|不超过20字的一句话预览]] 的格式标记 3–8 个值得深入的术语。
  只标记:理解本卡片所必需、且值得单独展开一张卡片的概念。不标记人名、地名和常识词汇。
- 「已有卡片标题列表」中出现过的术语,如需提及,写作 [[术语]](无预览),不要重复展开解释。
- 不要重复祖先卡片已经讲透的内容;默认读者已读过学习路径上的所有卡片。
- 如果本次请求附带了文献,回答必须基于文献内容并给出引用;文献没有覆盖的部分要明确说明。
- 直接输出卡片正文,不要任何开场白、标题行或结尾总结套话。

# 语气
面向聪明但非本领域的学习者;严谨优先,不堆砌术语,类比要准确而非仅仅生动。`;

export const DIGEST_PROMPT = `把以下学习路径压缩为不超过 300 字的摘要,保留:各层核心概念、它们之间的推导/包含关系、用户当前的学习意图。丢弃:例子、修辞、格式标记。直接输出摘要文本。`;

export const REVIEW_SYSTEM = `你是 Explore 思维宇宙的评审官。用户读完一张知识卡片后,用自己的话写下了理解。你要评审这段理解能否作为"已内化的知识"存入他的思维宇宙。

# 评分维度
- accuracy(0-10):理解是否准确,有无事实性偏差或因果颠倒。
- completeness(0-10):是否抓住了卡片的核心要点(不要求面面俱到)。
- own_words:是否用了自己的话。大段复述或改写卡片原文 = false。

# 判定规则
- passed = accuracy >= 7 且 own_words = true。completeness 不影响通过,只影响评语。
- 口语化、粗糙但方向正确的表述应当通过;精致但错误的表述不能通过。

# 评语规则
- praise:先具体指出说对了什么(必须真诚具体,不空洞)。
- gaps:每条指出一个具体偏差,给线索不给答案(引导用户自己修正)。
- hint:一句引导性提示,帮助用户下一次表述得更准。
- 全部使用中文,语气温和。`;

export const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    accuracy: { type: "integer" },
    completeness: { type: "integer" },
    own_words: { type: "boolean" },
    passed: { type: "boolean" },
    praise: { type: "string" },
    gaps: { type: "array", items: { type: "string" } },
    hint: { type: "string" },
  },
  required: [
    "accuracy",
    "completeness",
    "own_words",
    "passed",
    "praise",
    "gaps",
    "hint",
  ],
  additionalProperties: false,
} as const;

export interface ReviewResult {
  accuracy: number;
  completeness: number;
  own_words: boolean;
  passed: boolean;
  praise: string;
  gaps: string[];
  hint: string;
}

export interface InstructionInput {
  cardType: "root" | "child" | "related" | "branch";
  /** root: 问题;child/related: 术语;branch: 新问题 */
  subject: string;
  parentTitle?: string;
  /** 文献划词提问时的原文引文 */
  quote?: string;
  /** 同树已有卡片标题,用于去重提示 */
  existingTitles: string[];
  /** 思维宇宙知识锚点(用户自己的理解),可选 */
  anchors?: { concept: string; summary: string }[];
  /** 该树是否关联文献 */
  hasDocument?: boolean;
  /** 本次提问是否附带图片 */
  hasImages?: boolean;
}

export function buildInstruction(input: InstructionInput): string {
  const parts: string[] = [];

  switch (input.cardType) {
    case "root":
      parts.push(
        input.hasDocument
          ? `请基于所附文献,为以下问题生成根卡片,并给出引用:\n\n${input.subject}`
          : `请为以下问题生成根卡片:\n\n${input.subject}`,
      );
      break;
    case "child":
      if (input.quote) {
        parts.push(
          `用户在文献中划选了下面这段内容,想要弄懂它:\n\n> ${input.quote}\n\n请生成解释这段内容的卡片${input.hasDocument ? ",结合文献上下文并给出引用" : ""}。`,
        );
      } else {
        parts.push(
          `用户在《${input.parentTitle}》卡片中点击了术语「${input.subject}」。请生成这个术语的子卡片:深入解释它,并自然衔接父卡片的语境(读者是从父卡片点进来的)。`,
        );
      }
      break;
    case "related":
      parts.push(
        `用户想把《${input.parentTitle}》与「${input.subject}」做横向对比。请生成一张对比卡片:先各用一句话点明两者本质,再从 2–3 个关键维度对比异同,重点解释初学者最容易混淆的地方。`,
      );
      break;
    case "branch":
      parts.push(
        `用户在读完《${input.parentTitle}》及其学习路径后,想换个角度追问一个新问题(请在已有上下文的基础上回答,不要从零科普):\n\n${input.subject}`,
      );
      break;
  }

  if (input.hasImages) {
    parts.push("# 图片提问\n用户附上了图片。请先准确识别图片中的主体、文字、图表或结构，再结合用户的问题回答；图片细节看不清或无法确认时，要明确说明，不要臆测。");
  }

  if (input.anchors && input.anchors.length > 0) {
    parts.push(
      `# 该用户已内化的相关理解(可用于类比教学)\n${input.anchors
        .map((a) => `- 「${a.concept}」:用户的话——"${a.summary}"`)
        .join("\n")}\n\n若某条理解与本卡片概念有真实的结构相似性,请显式用它做类比;没有合适的类比就忽略,不要生搬硬套。`,
    );
  }

  if (input.existingTitles.length > 0) {
    parts.push(
      `# 已有卡片标题列表\n${input.existingTitles.map((t) => `- ${t}`).join("\n")}`,
    );
  }

  return parts.join("\n\n");
}

/** 组装分支上下文段(缓存层 ③):祖先链摘要 + 父卡片全文 */
export function buildBranchContext(
  ancestorDigest: string | null | undefined,
  parentTitle: string,
  parentContent: string,
): string {
  const digestPart = ancestorDigest
    ? `# 学习路径摘要(更早的祖先卡片)\n${ancestorDigest}\n\n`
    : "";
  return `${digestPart}# 父卡片《${parentTitle}》全文\n${parentContent}`;
}

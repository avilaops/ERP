/**
 * How each assistant is pointed at the ERP: a page to open, a command to run
 * or a link that installs it. The same list the screen "Conectar um
 * assistente" shows. Pure: it only builds texts from the address of the ERP.
 */
export type ConnectClient = {
  id: string;
  name: string;
  group: "No navegador" | "No terminal" | "No editor";
  /** What the person does, in order. */
  steps: string[];
  /** A page of the assistant to open, where the address is pasted. */
  openUrl?: string;
  /** A link that opens the assistant's program and installs the connection by itself. */
  installLink?: string;
  /** A command to run in the terminal. */
  command?: string;
  /** A second command, to sign in. */
  loginCommand?: string;
};

const NAME = "erp";

export function connectClients(serverUrl: string): ConnectClient[] {
  const approve = "O assistente abre o login do ERP e pergunta se você permite. Clique em Permitir.";
  return [
    {
      id: "claude-ai", name: "Claude", group: "No navegador", openUrl: "https://claude.ai/settings/connectors",
      steps: ["Copie o endereço abaixo.", "Abra os conectores do Claude e escolha Adicionar conector personalizado.", "Dê um nome (por exemplo, ERP), cole o endereço e confirme.", approve],
    },
    {
      id: "chatgpt", name: "ChatGPT", group: "No navegador", openUrl: "https://chatgpt.com/plugins#settings/Connectors?create-connector=true&redirectAfter=%2Fplugins",
      steps: ["Copie o endereço abaixo.", "Abra os conectores do ChatGPT; a tela de criar conector já vem aberta.", "Cole o endereço como URL do servidor MCP, escolha OAuth e confirme.", approve],
    },
    {
      id: "claude-code", name: "Claude Code", group: "No terminal", command: `claude mcp add --transport http ${NAME} ${serverUrl}`,
      steps: ["Rode o comando abaixo no terminal.", "Abra o Claude Code, digite /mcp e escolha erp para entrar.", approve],
    },
    {
      id: "codex", name: "Codex", group: "No terminal", command: `codex mcp add ${NAME} --url "${serverUrl}"`, loginCommand: `codex mcp login ${NAME}`,
      steps: ["Rode o primeiro comando para cadastrar o ERP.", "Rode o segundo para entrar.", approve],
    },
    {
      id: "gemini-cli", name: "Gemini CLI", group: "No terminal", command: `gemini mcp add --transport http ${NAME} ${serverUrl}`,
      steps: ["Rode o comando abaixo no terminal.", "Abra o Gemini CLI, digite /mcp e escolha erp para entrar.", approve],
    },
    {
      id: "cursor", name: "Cursor", group: "No editor", installLink: `cursor://anysphere.cursor-deeplink/mcp/install?name=${NAME}&config=${Buffer.from(JSON.stringify({ url: serverUrl }), "utf8").toString("base64")}`,
      steps: ["Clique no botão: o Cursor abre e cadastra o ERP sozinho.", "Confirme a instalação no Cursor.", approve],
    },
    {
      id: "vscode", name: "VS Code", group: "No editor", installLink: `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: NAME, type: "http", url: serverUrl }))}`,
      steps: ["Clique no botão: o VS Code abre e cadastra o ERP sozinho.", "Confirme a instalação no VS Code.", approve],
    },
  ];
}

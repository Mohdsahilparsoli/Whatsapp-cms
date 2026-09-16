import readline from "node:readline";

/** Plain prompt — echoes what you type (fine for a User ID). */
export function ask(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Masked prompt — nothing is echoed back to the terminal (for a password). */
export function askHidden(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    let input = "";
    process.stdout.write(promptText);

    const wasRaw = stdin.isRaw;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (chunk: string) => {
      const char = chunk.toString();
      switch (char) {
        case "\n":
        case "\r":
        case "\u0004": // Ctrl-D
          stdin.setRawMode?.(wasRaw ?? false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(input);
          break;
        case "\u0003": // Ctrl-C
          process.stdout.write("\n");
          process.exit(1);
          break;
        case "\u007f": // Backspace
        case "\b":
          input = input.slice(0, -1);
          break;
        default:
          input += char;
          break;
      }
    };

    stdin.on("data", onData);
  });
}

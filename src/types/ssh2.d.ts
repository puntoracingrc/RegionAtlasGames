declare module "ssh2" {
  export class Client {
    on(event: string, listener: (...args: unknown[]) => void): this;
    exec(command: string, callback: (error: Error | undefined, stream: unknown) => void): void;
    connect(config: Record<string, unknown>): this;
    end(): void;
  }
}

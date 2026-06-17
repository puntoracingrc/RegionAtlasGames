declare module "ssh2" {
  export class Client {
    on(event: string, listener: (...args: any[]) => void): this;
    exec(command: string, callback: (error: Error | undefined, stream: any) => void): void;
    connect(config: Record<string, unknown>): this;
    end(): void;
  }
}

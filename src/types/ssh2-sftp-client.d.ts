declare module "ssh2-sftp-client" {
  export default class SftpClient {
    connect(config: Record<string, unknown>): Promise<void>;
    mkdir(remotePath: string, recursive?: boolean): Promise<unknown>;
    put(localPath: string, remotePath: string): Promise<unknown>;
    end(): Promise<void>;
  }
}

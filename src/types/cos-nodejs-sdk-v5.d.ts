declare module 'cos-nodejs-sdk-v5' {
  class COS {
    constructor(options: { SecretId: string; SecretKey: string });
    putObject(params: any, callback: (err: any, data: any) => void): void;
  }
  export default COS;
}
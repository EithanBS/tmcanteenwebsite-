declare module 'qrcode' {
  const QRCode: {
    toDataURL: (text: string, opts?: any) => Promise<string>;
  };
  export default QRCode;
}

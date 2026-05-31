export interface Mailer {
  sendPasswordResetEmail(
    to: string,
    subject: string,
    text: string,
    html: string
  ): Promise<void>
}

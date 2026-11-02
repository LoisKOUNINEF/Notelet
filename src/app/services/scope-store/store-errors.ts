// Until the settings are read, which area holds the notes is unknown.
export class SettingsNotLoadedError extends Error {
  constructor() {
    super('Your settings couldn\'t be read. Close and reopen the panel.');
    this.name = 'SettingsNotLoadedError';
  }
}

// A file Import can't read
export class InvalidBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBackupError';
  }
}

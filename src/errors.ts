export class ManagerError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ManagerError";
  }
}

export class AdapterNotFoundError extends ManagerError {
  constructor(id: string) {
    super(`No adapter is registered with id "${id}".`);
    this.name = "AdapterNotFoundError";
  }
}

export class AdapterAlreadyRegisteredError extends ManagerError {
  constructor(id: string) {
    super(`An adapter with id "${id}" is already registered.`);
    this.name = "AdapterAlreadyRegisteredError";
  }
}

export class AdapterNotConnectedError extends ManagerError {
  constructor(id: string, status: string) {
    super(`Adapter "${id}" is not connected (current status: ${status}).`);
    this.name = "AdapterNotConnectedError";
  }
}

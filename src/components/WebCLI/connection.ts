import { Label } from "./WebCLI";
type Options = {
  address: string;
  messageCallback: (message: string) => void;
  onclose: () => void;
  onopen: () => void;
  onerror: (error: string | Event) => void;
};

class Connection {
  address: string;
  _messageBuffer = "";
  _timeout: number | null = null;
  _messageCallback: (message: string) => void;
  _wsOnOpen: () => void;
  _wsOnClose: () => void;
  _wsOnError: (error: Event | string) => void;
  _ws: WebSocket | null = null;

  constructor(options: Options) {
    this._messageCallback = options.messageCallback;
    this.address = options.address;
    this._wsOnOpen = options.onopen;
    this._wsOnClose = options.onclose;
    this._wsOnError = options.onerror;
  }

  connect() {
    this._ws = new WebSocket(this.address);
    this._ws.onopen = this._wsOnOpen;
    this._ws.onclose = this._wsOnClose;
    this._ws.onmessage = this._handleMessage.bind(this);
    this._ws.onerror = this._wsOnError;
    return this;
  }

  send(message: string) {
    this._ws?.send(message);
  }

  disconnect() {
    console.log("disconnect");
    this._ws?.close();
    if (this._timeout) {
      clearTimeout(this._timeout);
    }
  }

  _handleMessage(messageEvent: MessageEvent) {
    try {
      let data: unknown;
      try {
        data = JSON.parse(messageEvent.data);
      } catch (e) {
        // TODO: write correct message:
        throw new Error("Incorrect data");
      }
      if (!data || typeof data !== "object") {
        // TODO: write correct message:
        throw new Error("Incorrect data");
      }
      if (
        "redirect-to" in data &&
        data["redirect-to"] &&
        typeof data["redirect-to"] === "string"
      ) {
        try {
          // This is a JAAS controller and we need to instead
          // connect to the sub controller.
          this._ws?.close();
          this.address = data["redirect-to"];
          this.connect();
        } catch (e) {
          // TODO: write correct message:
          throw new Error(Label.CONNECTION_ERROR);
        }
      }
      if ("done" in data && data.done) {
        // This is the last message.
        return;
      }
      if (!("output" in data) || !data.output) {
        // This is the first message, an empty object and a newline.
        return;
      }
      if (!Array.isArray(data.output)) {
        // TODO: write correct message:
        throw new Error("Incorrect data");
      }
      this._pushToMessageBuffer(`\n${data.output[0]}`);
    } catch (error) {
      this._wsOnError(
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "unknown error",
      );
      // XXX handle the invalid data response
    }
  }

  _pushToMessageBuffer(message: string) {
    const bufferEmpty = !!this._messageBuffer;
    this._messageBuffer = this._messageBuffer + message;
    if (bufferEmpty) {
      this._timeout = window.setTimeout(() => {
        /*
        The messageBuffer is required because the websocket returns messages
        much faster than React wants to update the component. Doing this allows
        us to store the messages in a buffer and then set the output every
        cycle.
      */
        this._messageCallback(this._messageBuffer);
        this._messageBuffer = "";
        this._timeout = null;
      });
    }
  }
}

export default Connection;

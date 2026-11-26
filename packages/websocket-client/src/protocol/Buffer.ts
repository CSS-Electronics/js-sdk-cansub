/**
 * Resizable byte buffer with little-endian and big-endian read/write operations.
 * Used for binary protocol decoding (HDLC frames with bytestuffing).
 */
export class Buffer {
    private buffer: ArrayBuffer;
    private length: number;
    private view: Uint8Array;

    constructor() {
        this.buffer = new ArrayBuffer(32, { maxByteLength: 1024 * 100 }); // 100KB max
        this.view = new Uint8Array(this.buffer);
        this.length = 0;
    }

    private _getRealIndex(index: number): number | null {
        if(index < 0) {
            index = this.getLength() + index;
        }
        if(index < 0 || index >= this.length) {
            return null;
        }
        return index;
    }

    private _reserveSpace(value: number): void {
        if((this.length + value) > this.buffer.byteLength) {
            // Calculate new size, ensuring we don't exceed maxByteLength
            const maxByteLength = (this.buffer as any).maxByteLength || (1024 * 100); // 100KB max
            const newSize = Math.min(this.buffer.byteLength * 2, maxByteLength);

            if (newSize <= this.buffer.byteLength) {
                throw new RangeError(`Buffer overflow: cannot grow beyond ${maxByteLength} bytes (current: ${this.buffer.byteLength}, needed: ${this.length + value})`);
            }

            this.buffer.resize(newSize);
        }
    }

    *[Symbol.iterator]() {
        for (let i = 0; i < this.length; i++) {
            yield this.view[i];
        }
    }

    getLength(): number {
        return this.length;
    }

    getView(): Uint8Array {
        return this.view.subarray(0, this.length);
    }

    popU8(): number {
        if(this.length === 0) {
            throw new RangeError();
        }

        const result = this.view[this.length - 1];
        this.trimEnd(1);
        return result;
    }

    readU8(index: number): number | null {
        const translatedIndex = this._getRealIndex(index);
        if(translatedIndex !== null) {
            return this.view[translatedIndex] >>> 0;
        }
        return null;
    }

    readU16(index: number, big_endian: boolean = false): number | null {
        let translatedIndex = this._getRealIndex(index);
        let result: number | null = null;

        if(translatedIndex !== null) {
            result = 0;

            if(big_endian) {
                result |= this.view[translatedIndex++] << 8;
                result |= this.view[translatedIndex] << 0;
            } else {
                result |= this.view[translatedIndex++] << 0;
                result |= this.view[translatedIndex] << 8;
            }

            result = result >>> 0;
        }

        return result;
    }

    readU32(index: number, big_endian: boolean = false): number | null {
        let translatedIndex = this._getRealIndex(index);
        let result: number | null = null;

        if(translatedIndex !== null) {
            result = 0;

            if (big_endian) {
                result |= this.view[translatedIndex++] << 24;
                result |= this.view[translatedIndex++] << 16;
                result |= this.view[translatedIndex++] << 8;
                result |= this.view[translatedIndex] << 0;
            } else {
                result |= this.view[translatedIndex++] << 0;
                result |= this.view[translatedIndex++] << 8;
                result |= this.view[translatedIndex++] << 16;
                result |= this.view[translatedIndex] << 24;
            }

            result = result >>> 0;
        }

        return result;
    }

    /**
     * Read 48-bit unsigned integer.
     * Split into upper 16 and lower 32 bits because JS bitwise ops are 32-bit only.
     */
    readU48(index: number, big_endian: boolean = false): number | null {
        const translatedIndex = this._getRealIndex(index);
        let result: number | null = null;

        if(translatedIndex !== null) {
            let result_upper = 0;
            let result_lower = 0;
            let idx = translatedIndex;

            if (big_endian) {
                result_upper |= this.view[idx++] << 8;
                result_upper |= this.view[idx++] << 0;
                result_lower |= this.view[idx++] << 24;
                result_lower |= this.view[idx++] << 16;
                result_lower |= this.view[idx++] << 8;
                result_lower |= this.view[idx] << 0;
            } else {
                result_lower |= this.view[idx++] << 0;
                result_lower |= this.view[idx++] << 8;
                result_lower |= this.view[idx++] << 16;
                result_lower |= this.view[idx++] << 24;
                result_upper |= this.view[idx++] << 0;
                result_upper |= this.view[idx] << 8;
            }

            result = (result_lower >>> 0) + (result_upper >>> 0) * Math.pow(2, 32);
        }

        return result;
    }

    reset(): void {
        this.trimStart(this.length);
    }

    trimStart(elements: number): void {
        if(elements > this.length) {
            elements = this.length;
        }

        const newSize = this.length - elements;
        if(newSize > 0) {
            for (let i = 0; i < newSize; i++) {
                this.view[i] = this.view[i + elements];
            }
        }

        this.length = newSize;
    }

    trimEnd(elements: number): void {
        if(elements > this.length) {
            elements = this.length;
        }

        this.length = this.length - elements;
    }

    writeU8(value: number | number[]): void {
        if(typeof value === "number") {
            value = [value]
        }
        this._reserveSpace(value.length);
        for (const v of value) {
            this.view[this.length++] = v & 0xFF;
        }
    }

    writeU16(value: number | number[], big_endian: boolean = false): void {
        if (typeof value === "number") {
            value = [value]
        }
        this._reserveSpace(value.length * 2);
        for (const v of value) {
            if (big_endian) {
                this.view[this.length++] = (v & 0xFF00) >>> 8;
                this.view[this.length++] = (v & 0x00FF) >>> 0;
            } else {
                this.view[this.length++] = (v & 0x00FF) >>> 0;
                this.view[this.length++] = (v & 0xFF00) >>> 8;
            }
        }
    }

    writeU32(value: number | number[], big_endian: boolean = false): void {
        if(typeof value === "number") {
            value = [value]
        }
        this._reserveSpace(value.length * 4);
        for (const v of value) {
            if(big_endian) {
                this.view[this.length++] = (v & 0xFF000000) >>> 24;
                this.view[this.length++] = (v & 0x00FF0000) >>> 16;
                this.view[this.length++] = (v & 0x0000FF00) >>> 8;
                this.view[this.length++] = (v & 0x000000FF) >>> 0;
            } else {
                this.view[this.length++] = (v & 0x00FF) >>> 0;
                this.view[this.length++] = (v & 0xFF00) >>> 8;
                this.view[this.length++] = (v & 0x00FF0000) >>> 16;
                this.view[this.length++] = (v & 0xFF000000) >>> 24;
            }
        }
    }

    writeU48(value: number | number[], big_endian: boolean = false): void {
        if(typeof value === "number") {
            value = [value]
        }
        this._reserveSpace(value.length * 6);
        for (const v of value) {
            if(big_endian) {
                this.view[this.length++] = (v / Math.pow(2, 40)) & 0xFF
                this.view[this.length++] = (v / Math.pow(2, 32)) & 0xFF
                this.view[this.length++] = (v & 0xFF000000) >>> 24;
                this.view[this.length++] = (v & 0x00FF0000) >>> 16;
                this.view[this.length++] = (v & 0x0000FF00) >>> 8;
                this.view[this.length++] = (v & 0x000000FF) >>> 0;
            } else {
                this.view[this.length++] = (v & 0x00FF) >>> 0;
                this.view[this.length++] = (v & 0xFF00) >>> 8;
                this.view[this.length++] = (v & 0x00FF0000) >>> 16;
                this.view[this.length++] = (v & 0xFF000000) >>> 24;
                this.view[this.length++] = (v / Math.pow(2, 32)) & 0xFF
                this.view[this.length++] = (v / Math.pow(2, 40)) & 0xFF
            }
        }
    }

    loadFrom(view: Uint8Array): void {
        if (view.byteLength > this.buffer.byteLength) {
            this.buffer.resize(view.byteLength);
        }
        this.view.set(view);
        this.length = view.byteLength;
    }

    static fromHex(hex: string): Buffer {
        let result = new Buffer();

        let hex_matches = hex.match(/[\dA-F]{2}/ig);
        hex_matches?.map((v, _i, _a) => {
            result.writeU8(Number.parseInt(v, 16));
        })

        return result;
    }

    static fromView(view: Uint8Array): Buffer {
        let result = new Buffer();

        result.buffer.resize(view.byteLength);
        result.view.set(view);
        result.length = view.byteLength;

        return result;
    }
}

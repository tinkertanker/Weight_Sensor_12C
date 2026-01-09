namespace hx711gravity {
    // KIT0176 default I2C address: 0x64
    // Other possible addresses: 0x65–0x67 (if A0/A1 changed on the board)
    const ADDRESS = 0x64

    // Registers from DFRobot_HX711_I2C
    enum Register {
        CLEAR_REG_STATE = 0x65,
        DATA_GET_RAM_DATA = 0x66,
        DATA_GET_CALIBRATION = 0x67,
        DATA_GET_PEEL_FLAG = 0x69,
        DATA_INIT_SENSOR = 0x70,
        SET_CAL_THRESHOLD = 0x71,
        SET_TRIGGER_WEIGHT = 0x72,
        CLICK_RST = 0x73,
        CLICK_CAL = 0x74
    }

    let offset = 0
    let calibration = 2236.0
    let initialised = false

    function writeRegOnly(reg: Register): void {
        // Write just 1 byte (the register command)
        const b = pins.createBuffer(1)
        b.setUint8(0, reg)
        pins.i2cWriteBuffer(ADDRESS, b, false)
    }

    function readReg(reg: Register, size: number): Buffer {
        // Write register, then read payload
        writeRegOnly(reg)
        basic.pause(22)
        return pins.i2cReadBuffer(ADDRESS, size, false)
    }

    function getValue(): number {
        const buf = readReg(Register.DATA_GET_RAM_DATA, 4)

        // DFRobot library expects first byte == 0x12
        if (buf.getUint8(0) != 0x12) return 0

        let value = (buf.getUint8(1) << 16) | (buf.getUint8(2) << 8) | buf.getUint8(3)

        // Same conversion as DFRobot code: value ^ 0x800000
        return value ^ 0x800000
    }

    function average(times: number): number {
        let sum = 0
        for (let i = 0; i < times; i++) {
            sum += getValue()
        }
        return sum / times
    }

    function peelFlag(): number {
        const b = readReg(Register.DATA_GET_PEEL_FLAG, 1)
        return b.getUint8(0) // 0, 1 (tare happened), 2 (calibration updated)
    }

    function getCalibration(): number {
        const b = readReg(Register.DATA_GET_CALIBRATION, 4)
        // Big-endian float32
        return b.getNumber(NumberFormat.Float32BE, 0)
    }

    /**
     * Initialise the sensor (call once at start).
     */
    //% block="hx711 i2c begin"
    export function begin(): void {
        // The Arduino lib writes INIT then CLEAR in one transmission.
        // Doing them as two I2C writes generally works fine.
        writeRegOnly(Register.DATA_INIT_SENSOR)
        writeRegOnly(Register.CLEAR_REG_STATE)

        offset = average(10)
        initialised = true
    }

    /**
     * Read weight in grams.
     */
    //% block="hx711 i2c read weight (avg %times)"
    export function readWeight(times: number = 12): number {
        if (!initialised) begin()

        const value = average(times)
        const flag = peelFlag()

        if (flag == 1) {
            // Tare was triggered (RST button or software)
            offset = average(times)
        } else if (flag == 2) {
            // Calibration updated
            calibration = getCalibration()
        }

        return (value - offset) / calibration
    }

    /**
     * Tare (like pressing RST).
     */
    //% block="hx711 i2c tare"
    export function tare(): void {
        offset = average(10)
        writeRegOnly(Register.CLICK_RST)
    }

    /**
     * Start calibration (like pressing CAL).
     */
    //% block="hx711 i2c start calibration"
    export function startCalibration(): void {
        writeRegOnly(Register.CLICK_CAL)
    }

    /**
     * Set auto-calibration trigger threshold (grams).
     */
    //% block="hx711 i2c set threshold (g) %g"
    export function setThreshold(g: number): void {
        // 1 byte reg + 2 bytes data = 3 bytes total
        const out = pins.createBuffer(3)
        out.setUint8(0, Register.SET_CAL_THRESHOLD)
        out.setUint8(1, (g >> 8) & 0xff)
        out.setUint8(2, g & 0xff)
        pins.i2cWriteBuffer(ADDRESS, out, false)
        basic.pause(50)
    }

    /**
     * Set the calibration weight used for auto-calibration (grams).
     */
    //% block="hx711 i2c set calibration weight (g) %g"
    export function setCalWeight(g: number): void {
        const out = pins.createBuffer(3)
        out.setUint8(0, Register.SET_TRIGGER_WEIGHT)
        out.setUint8(1, (g >> 8) & 0xff)
        out.setUint8(2, g & 0xff)
        pins.i2cWriteBuffer(ADDRESS, out, false)
        basic.pause(50)
    }
}

/* ---------------------------
   Example usage (edit as needed)
   --------------------------- */

const THRESHOLD_G = 100
const BUZZER_PIN = DigitalPin.P0

hx711gravity.begin()

basic.forever(function () {
    const w = hx711gravity.readWeight(12)

    // Debug: show the weight
    basic.showNumber(Math.round(w))

    if (w > THRESHOLD_G) {
        pins.digitalWritePin(BUZZER_PIN, 1)
    } else {
        pins.digitalWritePin(BUZZER_PIN, 0)
    }

    basic.pause(100)
})

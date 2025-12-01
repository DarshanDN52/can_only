from flask import Flask, request, jsonify, render_template
from PCANBasic import *
import atexit
import json
import time # Import time for potential future use, e.g., timestamping data

# Initialize Flask app
app = Flask(__name__)

# Global PCANBasic object
pcan = PCANBasic()

# --- Globals for CAN connection ---
# You can change these defaults
PCAN_HANDLE = PCAN_USBBUS1
BAUDRATE = PCAN_BAUD_500K
IS_FD = False
pcan_initialized = False

# --- Global for TPMS collection state ---
is_tpms_collection_active = False

def get_error_text(status):
    """Helper function to get error text from a PCANStatus"""
    error_text_tuple = pcan.GetErrorText(status)
    if error_text_tuple[0] == PCAN_ERROR_OK:
        return error_text_tuple[1].decode('utf-8')
    else:
        return f"Unknown error code: {status:05X}h"

def release_hardware_on_exit():
    """Ensures CAN hardware is released on script exit."""
    global pcan_initialized, pcan, PCAN_HANDLE
    if pcan_initialized:
        print("Releasing PCAN hardware on exit...")
        pcan.Uninitialize(PCAN_HANDLE)
        pcan_initialized = False
        print("PCAN hardware released.")

atexit.register(release_hardware_on_exit)

@app.route('/')
def index():
    return "PCAN-Basic API Server is running. Use the /api endpoints to interact with the CAN bus."

@app.route('/tpms')
def tpms_dashboard():
    """Serves the TPMS dashboard front-end without modifying its assets."""
    return render_template('tpms.html')
    
@app.route('/api/tpms/status', methods=['GET'])
def get_tpms_status():
    """Returns the current status of TPMS data collection."""
    return jsonify({"success": True, "is_collecting": is_tpms_collection_active})

@app.route('/api/tpms/start', methods=['POST'])
def start_tpms_collection():
    """Starts TPMS data collection."""
    global is_tpms_collection_active
    is_tpms_collection_active = True
    tire_count = request.json.get('tire_count', 0)
    print(f"TPMS collection started with {tire_count} tires.")
    return jsonify({"success": True, "message": "TPMS collection started.", "is_collecting": is_tpms_collection_active})

@app.route('/api/tpms/stop', methods=['POST'])
def stop_tpms_collection():
    """Stops TPMS data collection."""
    global is_tpms_collection_active
    is_tpms_collection_active = False
    print("TPMS collection stopped.")
    return jsonify({"success": True, "message": "TPMS collection stopped.", "is_collecting": is_tpms_collection_active})

@app.route('/api/init', methods=['POST'])
def init_can():
    """
    Initializes a PCAN channel.
    JSON Body (optional): { "channel": "PCAN_USBBUS1", "baudrate": "PCAN_BAUD_500K", "is_fd": false }
    """
    global PCAN_HANDLE, BAUDRATE, IS_FD, pcan_initialized

    data = request.get_json()
    print(f"Received init data: {data}") # Debug logging
    if data:
        # Use globals() to get the constant value from its string name
        pcan_handle_obj = globals().get(data.get('channel', 'PCAN_USBBUS1'), PCAN_USBBUS1)
        baudrate_obj = globals().get(data.get('baudrate', 'PCAN_BAUD_500K'), PCAN_BAUD_500K)
        IS_FD = data.get('is_fd', False)
        # Note: FD Bitrate string is not implemented in this simple example
    else:
        pcan_handle_obj = PCAN_HANDLE
        baudrate_obj = BAUDRATE

    if IS_FD:
        # Note: A valid FD bitrate string is required here.
        # This example does not construct one.
        # e.g., "f_clock_mhz=20, nom_brp=5, ... , data_sjw=1"
        # status = pcan.InitializeFD(PCAN_HANDLE, FD_BITRATE_STRING)
        return jsonify({"success": False, "error": "CAN-FD Initialization is not fully implemented in this example."}), 501
    else:
        handle_value = pcan_handle_obj.value if hasattr(pcan_handle_obj, 'value') else pcan_handle_obj
        baudrate_value = baudrate_obj.value if hasattr(baudrate_obj, 'value') else baudrate_obj
        print(f"Attempting to initialize with handle: {handle_value:02X}h and baudrate: {baudrate_value:04X}h") # Debug logging
        status = pcan.Initialize(handle_value, baudrate_value)

    if status == PCAN_ERROR_OK:
        # The global handle needs to be updated for other functions to use
        PCAN_HANDLE = pcan_handle_obj
        pcan_initialized = True
        return jsonify({"success": True, "message": f"Channel {handle_value:02X}h initialized successfully at the specified baudrate."})
    else:
        pcan_initialized = False
        return jsonify({"success": False, "error": get_error_text(status)}), 500

@app.route('/api/release', methods=['POST'])
def release_can():
    """Uninitializes the connected PCAN channel."""
    global pcan_initialized
    status = pcan.Uninitialize(PCAN_HANDLE)
    if status == PCAN_ERROR_OK:
        pcan_initialized = False
        return jsonify({"success": True, "message": "Channel released."})
    else:
        return jsonify({"success": False, "error": get_error_text(status)}), 500

@app.route('/api/status', methods=['GET'])
def get_status():
    """Gets the current status of the PCAN channel."""
    status = pcan.GetStatus(PCAN_HANDLE)
    # GetStatus returns the status code itself, not a tuple
    return jsonify({
        "status_code": f"{status:05X}h",
        "status_text": get_error_text(status)
        })

def parse_sensor_data(data_bytes):
    """
    Parses 8-byte sensor data (TPMS format).
    Byte 0: Sensor ID (tire)
    Byte 1: Packet type
    Bytes 2-3: Pressure (decimal value)
    Bytes 4-5: Temperature (arrange as byte[5] then byte[4], then (value - 8500) / 100)
    Byte 6: Battery (decimal value * 10 + 2000 = mW, convert to Watts / 1000)
    """
    try:
        if len(data_bytes) < 7:
            return None
        
        sensor_id = data_bytes[0]
        packet_type = data_bytes[1]
        
        # Pressure (bytes 2-3)
        pressure = (data_bytes[2] << 8) | data_bytes[3]
        
        # Temperature (bytes 4-5, arrange as 5th then 4th)
        temp_raw = (data_bytes[5] << 8) | data_bytes[4]
        temperature = (temp_raw - 8500) / 100.0
        
        # Battery (byte 6, formula: value * 10 + 2000 = mW, then convert to watts)
        battery_mw = (data_bytes[6] * 10) + 2000
        battery_watts = battery_mw / 1000.0
        
        return {
            "sensor_id": sensor_id,
            "packet_type": packet_type,
            "pressure": pressure,
            "temperature": round(temperature, 2),
            "battery_watts": round(battery_watts, 2)
        }
    except Exception as e:
        print(f"Error parsing sensor data: {e}")
        return None

@app.route('/api/read', methods=['GET'])
def read_message():
    """Reads a CAN message from the receive queue."""
    if IS_FD:
        result_tuple = pcan.ReadFD(PCAN_HANDLE)
    else:
        result_tuple = pcan.Read(PCAN_HANDLE)

    status = result_tuple[0]
    if status == PCAN_ERROR_QRCVEMPTY:
        return jsonify({"success": True, "message": "Receive queue is empty."})

    if status != PCAN_ERROR_OK:
        return jsonify({"success": False, "error": get_error_text(status)}), 500

    can_msg = result_tuple[1]
    timestamp = result_tuple[2]

    # Extract raw data bytes
    data_len = can_msg.LEN if not IS_FD else can_msg.DLC
    data_bytes = [can_msg.DATA[i] for i in range(data_len)]

    # Parse sensor data if 8 bytes
    parsed_data = None
    if data_len >= 7:
        parsed_data = parse_sensor_data(data_bytes)

    # Convert ctypes object to a dictionary for JSON serialization
    msg_data = {
        "id": f"{can_msg.ID:X}",
        "msg_type": can_msg.MSGTYPE,
        "len": data_len,
        "data": data_bytes,
        "parsed": parsed_data  # Include parsed sensor data
    }
    
    # Handle timestamp for both standard and FD
    if isinstance(timestamp, TPCANTimestamp):
         ts_value = timestamp.micros + (1000 * timestamp.millis) + (0x100000000 * 1000 * timestamp.millis_overflow)
    else: # TPCANTimestampFD (ulonglong)
        ts_value = timestamp.value

    return jsonify({
        "success": True,
        "message": msg_data,
        "timestamp_us": ts_value
    })


@app.route('/api/write', methods=['POST'])
def write_message():
    """
    Writes a CAN message.
    JSON Body: { "id": "100", "data": [1, 2, 3, 4, 5, 6, 7, 8], "extended": false, "rtr": false }
    """
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "Invalid JSON body."}), 400

    try:
        # Prepare message
        if IS_FD:
            msg = TPCANMsgFD()
            msg.DLC = len(data.get('data', []))
        else:
            msg = TPCANMsg()
            msg.LEN = len(data.get('data', []))

        # ID
        msg.ID = int(data['id'], 16)

        # Message Type
        msg.MSGTYPE = PCAN_MESSAGE_STANDARD.value
        if data.get('extended', False):
            msg.MSGTYPE |= PCAN_MESSAGE_EXTENDED.value
        if data.get('rtr', False):
            msg.MSGTYPE |= PCAN_MESSAGE_RTR.value
        # Note: BRS and ESI for FD are not handled here for simplicity

        # Data
        for i, byte_val in enumerate(data.get('data', [])):
            msg.DATA[i] = byte_val

        # Write message
        if IS_FD:
            status = pcan.WriteFD(PCAN_HANDLE, msg)
        else:
            status = pcan.Write(PCAN_HANDLE, msg)

        if status == PCAN_ERROR_OK:
            return jsonify({"success": True, "message": "Message sent successfully."})
        else:
            return jsonify({"success": False, "error": get_error_text(status)}), 500

    except (KeyError, ValueError, TypeError) as e:
        return jsonify({"success": False, "error": f"Invalid request format: {e}"}), 400


if __name__ == '__main__':
    # Add dependencies for flask
    try:
        from flask import Flask, request, jsonify
    except ImportError:
        print("Flask not found. Please run 'pip install Flask'")
        exit()
    
    try:
        app.run(host='0.0.0.0', port=5001)
    finally:
        release_hardware_on_exit()
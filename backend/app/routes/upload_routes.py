import os
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename

upload_bp = Blueprint("upload", __name__)

UPLOAD_FOLDER = os.path.join("app", "static", "uploads")
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "svg", "webp"}

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

@upload_bp.route("/upload_logo", methods=["POST"])
def upload_logo():
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(file_path)

        # Ruta relativa pública
        public_url = f"/static/uploads/{filename}"
        return jsonify({"url": public_url}), 200

    return jsonify({"error": "Invalid file type"}), 400

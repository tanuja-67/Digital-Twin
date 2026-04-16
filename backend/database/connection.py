from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def init_db(app):
    db.init_app(app)
    with app.app_context():
        import models  # noqa: F401 — register models before create_all
        db.create_all()

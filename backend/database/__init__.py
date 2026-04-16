from database.connection import db, init_db


def load_csv_to_database(csv_path=None):
    """Load cleaned CSV into SQLite (see ``database.csv_loader``)."""
    from database.csv_loader import load_csv_to_database as _load

    return _load(csv_path)


__all__ = ["db", "init_db", "load_csv_to_database"]

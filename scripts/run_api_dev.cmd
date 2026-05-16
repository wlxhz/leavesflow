@echo off
set PYTHONPATH=services/api/src
python -m uvicorn leavesflow_api.main:app --host 127.0.0.1 --port 8000

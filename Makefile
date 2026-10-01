.PHONY: install db api web dev test lint

install:
	cd backend && uv sync
	cd frontend && npm install

db:
	-createdb coframe
	-createdb coframe_test
	cd backend && uv run alembic upgrade head

api:
	cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8100 --reload

web:
	cd frontend && npm run dev -- --port 3100

dev:
	@trap 'kill 0' INT TERM; \
	(cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8100 --reload) & \
	(cd frontend && npm run dev -- --port 3100) & \
	wait

test:
	cd backend && uv run pytest -q
	cd frontend && npm test

lint:
	cd backend && uv run ruff check app tests scripts
	cd frontend && npm run typecheck && npx eslint .

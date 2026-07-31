# ── Managed PostgreSQL (RDS) ───────────────────────────────────────────────
resource "aws_security_group" "db" {
  name        = "${var.environment}-windels-db-sg"
  description = "Allow Postgres from within VPC"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    cidr_blocks     = [var.vpc_cidr]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${var.environment}-windels-db-sg" }
}

resource "random_password" "db" {
  length  = 32
  special = true
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.environment}-windels-db-subnets"
  subnet_ids = var.private_subnet_ids
}

resource "aws_db_instance" "main" {
  identifier             = "${var.environment}-windels-db"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = var.instance_class
  allocated_storage      = var.allocated_storage
  db_name                = "windels"
  username               = "windels"
  password               = random_password.db.result
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  skip_final_snapshot    = var.environment != "prod"
  backup_retention_period = var.environment == "prod" ? 30 : 7
  multi_az                = var.environment == "prod"
  publicly_accessible     = false
  storage_encrypted       = true
  tags = { Name = "${var.environment}-windels-db" }
}

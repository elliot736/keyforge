resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-${var.environment}"
  subnet_ids = aws_subnet.private[*].id
  tags       = { Name = "${var.project}-${var.environment}-db-subnet" }
}

resource "aws_db_instance" "main" {
  identifier     = "${var.project}-${var.environment}"
  engine         = "postgres"
  engine_version = "16.4"
  instance_class = var.db_instance_class

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "keyforge"
  username = "keyforge"
  password = random_password.db_password.result

  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  multi_az            = var.environment == "prod"
  publicly_accessible = false
  skip_final_snapshot = var.environment != "prod"
  deletion_protection = var.enable_deletion_protection

  final_snapshot_identifier = var.enable_deletion_protection ? "${var.project}-${var.environment}-final" : null

  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  performance_insights_enabled = true

  tags = { Name = "${var.project}-${var.environment}-postgres" }
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

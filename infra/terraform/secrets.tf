resource "random_password" "auth_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "app_secrets" {
  name                    = "${var.project}/${var.environment}/app-secrets"
  description             = "KeyForge application secrets"
  recovery_window_in_days = var.environment == "prod" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = aws_secretsmanager_secret.app_secrets.id
  secret_string = jsonencode({
    DATABASE_URL          = "postgresql://${aws_db_instance.main.username}:${random_password.db_password.result}@${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}"
    REDIS_URL             = "redis://${aws_elasticache_cluster.main.cache_nodes[0].address}:6379"
    BETTER_AUTH_SECRET    = random_password.auth_secret.result
    STRIPE_SECRET_KEY     = ""
    STRIPE_WEBHOOK_SECRET = ""
  })
}

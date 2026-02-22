output "api_url" {
  description = "API load balancer URL"
  value       = "http://${aws_lb.main.dns_name}:4000"
}

output "dashboard_url" {
  description = "Dashboard load balancer URL"
  value       = "http://${aws_lb.main.dns_name}"
}

output "ecr_api_repo" {
  description = "ECR repository URL for API"
  value       = aws_ecr_repository.api.repository_url
}

output "ecr_dashboard_repo" {
  description = "ECR repository URL for Dashboard"
  value       = aws_ecr_repository.dashboard.repository_url
}

output "rds_endpoint" {
  description = "RDS endpoint"
  value       = aws_db_instance.main.endpoint
}

output "redis_endpoint" {
  description = "ElastiCache endpoint"
  value       = aws_elasticache_cluster.main.cache_nodes[0].address
}

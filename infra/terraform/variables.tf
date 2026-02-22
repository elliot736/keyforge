variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "prod"
}

variable "project" {
  description = "Project name"
  type        = string
  default     = "keyforge"
}

variable "domain" {
  description = "Domain name for the application (optional)"
  type        = string
  default     = ""
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t4g.micro"
}

variable "api_cpu" {
  description = "API task CPU units"
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "API task memory (MB)"
  type        = number
  default     = 1024
}

variable "api_desired_count" {
  description = "Number of API tasks"
  type        = number
  default     = 2
}

variable "dashboard_cpu" {
  description = "Dashboard task CPU units"
  type        = number
  default     = 256
}

variable "dashboard_memory" {
  description = "Dashboard task memory (MB)"
  type        = number
  default     = 512
}

variable "dashboard_desired_count" {
  description = "Number of dashboard tasks"
  type        = number
  default     = 2
}

variable "enable_deletion_protection" {
  description = "Enable deletion protection on RDS and ALB"
  type        = bool
  default     = true
}

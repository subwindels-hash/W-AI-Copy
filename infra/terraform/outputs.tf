output "vpc_id" {
  description = "VPC ID"
  value       = module.network.vpc_id
}

output "db_endpoint" {
  description = "RDS endpoint"
  value       = module.database.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache primary endpoint"
  value       = module.redis.endpoint
  sensitive   = true
}

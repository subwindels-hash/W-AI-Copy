variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev/staging/prod)"
  type        = string
  default     = "dev"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev/staging/prod."
  }
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "AZs (at least 2 for multi-AZ)"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GiB"
  type        = number
  default     = 20
}

variable "cache_instance_class" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t4g.micro"
}

variable "domain_name" {
  description = "Primary domain name"
  type        = string
  default     = ""
}

variable "acm_cert_arn" {
  description = "ACM certificate ARN for TLS"
  type        = string
  default     = ""
}

variable "k8s_version" {
  description = "EKS Kubernetes version"
  type        = string
  default     = "1.30"
}

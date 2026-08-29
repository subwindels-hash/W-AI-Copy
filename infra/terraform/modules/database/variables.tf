variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "vpc_cidr" { type = string; default = "10.0.0.0/16" }
variable "private_subnet_ids" { type = list(string) }
variable "instance_class" { type = string; default = "db.t4g.micro" }
variable "allocated_storage" { type = number; default = 20 }
